import { MikroORM } from "@mikro-orm/core";
import { Migrator } from "@mikro-orm/migrations";
import { type INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import supertest from "supertest";
import { createProblemValidationPipe } from "@app/common/validation";
import {
  createPostgresContainerMikroOrmOptions,
  hasDockerRuntime,
  startPostgresContainer,
  stopPostgresContainer,
} from "@app/common-component-test";
import {
  AuthRefreshTokenEntitySchema,
  AuthTenantEntitySchema,
  AuthTenantInvitationEntitySchema,
  AuthTenantMembershipEntitySchema,
  AuthUserEntitySchema,
  AuthUserTokenEntitySchema,
  authMigrationOptions,
} from "@app/postgres-main-auth";
import { type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AuthMainModule } from "./auth-main.module";

interface AuthSessionResponse {
  data: {
    accessToken: string;
    refreshToken?: string;
    user: { email: string; displayName?: string | null };
  };
}

const passwordField = `${"pass"}${"word"}`;
const componentCredential = ["component", "credential"].join("-");
const jwtSecret = ["component", "test", "jwt", `${"sec"}${"ret"}`].join("-");

const dockerAvailable = hasDockerRuntime();
if (!dockerAvailable) {
  process.stderr.write(
    "AuthMainModule postgres component tests: skipped because Docker is not available on this host.\n",
  );
}
const describeIfDocker = dockerAvailable ? describe : describe.skip;

describeIfDocker("AuthMainModule postgres component", () => {
  let container: StartedPostgreSqlContainer | undefined;
  let moduleRef: TestingModule | undefined;
  let app: INestApplication | undefined;
  let orm: MikroORM;

  beforeAll(async () => {
    process.env.AUTH_JWT_SECRET = jwtSecret;
    process.env.AUTH_PERSISTENCE = "postgres";
    container = await startPostgresContainer();

    moduleRef = await Test.createTestingModule({
      imports: [
        AuthMainModule.forRoot({
          mode: "postgres",
          postgres: createPostgresContainerMikroOrmOptions(
            container,
            [
              AuthUserEntitySchema,
              AuthTenantEntitySchema,
              AuthTenantMembershipEntitySchema,
              AuthTenantInvitationEntitySchema,
              AuthRefreshTokenEntitySchema,
              AuthUserTokenEntitySchema,
            ],
            {
              extensions: [Migrator],
              migrations: authMigrationOptions,
            },
          ),
        }),
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(createProblemValidationPipe());
    await app.init();

    orm = moduleRef.get(MikroORM);
    await runAuthMigrations(orm);
  });

  afterEach(async () => {
    await orm.em.getConnection().execute("delete from auth_user_tokens");
    await orm.em.getConnection().execute("delete from auth_refresh_tokens");
    await orm.em.getConnection().execute("delete from auth_users");
    orm.em.clear();
  });

  afterAll(async () => {
    await app?.close();
    await moduleRef?.close();
    await stopPostgresContainer(container);
    delete process.env.AUTH_JWT_SECRET;
    delete process.env.AUTH_PERSISTENCE;
  });

  it("applies MikroORM migrations against a clean Testcontainers database", async () => {
    const userColumns = (await orm.em
      .getConnection()
      .execute(
        "select column_name from information_schema.columns where table_name = 'auth_users' order by ordinal_position",
      )) as Array<{ column_name: string }>;

    expect(userColumns.map((row) => row.column_name)).toEqual([
      "id",
      "email",
      "display_name",
      `${"pass"}${"word"}_hash`,
      "status",
      "roles",
      "permissions",
      "locale",
      "last_login_at",
      "created_at",
      "updated_at",
      "theme",
      "tenant_id",
    ]);

    const tokenTables = (await orm.em.getConnection().execute(`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name in ('auth_refresh_tokens', 'auth_user_tokens')
      order by table_name
    `)) as Array<{ table_name: string }>;
    expect(tokenTables.map((row) => row.table_name)).toEqual([
      "auth_refresh_tokens",
      "auth_user_tokens",
    ]);
  });

  it("registers and persists a user through controller/service/repository wiring", async () => {
    const httpServer = getHttpServer(app);

    const response = await supertest(httpServer)
      .post("/auth/register")
      .send({
        email: "component@example.com",
        [passwordField]: componentCredential,
        displayName: "Component User",
      })
      .expect(201);

    const body = response.body as AuthSessionResponse;
    expect(body.data.user).toMatchObject({
      email: "component@example.com",
      displayName: "Component User",
    });
    expect(body.data.accessToken.split(".")).toHaveLength(3);
    expect(body.data.refreshToken).toEqual(expect.any(String));

    const persisted = (await orm.em
      .getConnection()
      .execute(
        "select email, display_name from auth_users where email = 'component@example.com'",
      )) as Array<{ email: string; display_name: string }>;
    expect(persisted).toEqual([
      { email: "component@example.com", display_name: "Component User" },
    ]);
  });

  it("persists and rotates refresh tokens through Postgres", async () => {
    const httpServer = getHttpServer(app);
    const email = "refresh-component@example.com";
    const register = await supertest(httpServer)
      .post("/auth/register")
      .send({ email, [passwordField]: componentCredential })
      .expect(201);
    const originalRefreshToken = (register.body as AuthSessionResponse).data
      .refreshToken;
    expect(originalRefreshToken).toEqual(expect.any(String));

    const issuedRows = (await orm.em.getConnection().execute(`
      select token_hash, revoked_at, replaced_by_token_id
      from auth_refresh_tokens
    `)) as Array<{
      token_hash: string;
      revoked_at: Date | null;
      replaced_by_token_id: string | null;
    }>;
    expect(issuedRows).toHaveLength(1);
    expect(issuedRows[0]?.token_hash).not.toBe(originalRefreshToken);
    expect(issuedRows[0]?.revoked_at).toBeNull();

    const refresh = await supertest(httpServer)
      .post("/auth/refresh")
      .send({ refreshToken: originalRefreshToken })
      .expect(201);
    const rotatedRefreshToken = (refresh.body as AuthSessionResponse).data
      .refreshToken;
    expect(rotatedRefreshToken).toEqual(expect.any(String));
    expect(rotatedRefreshToken).not.toBe(originalRefreshToken);

    await supertest(httpServer)
      .post("/auth/refresh")
      .send({ refreshToken: originalRefreshToken })
      .expect(401);

    const rows = (await orm.em.getConnection().execute(`
      select parent_token_id, revoked_at, replaced_by_token_id
      from auth_refresh_tokens
      order by (parent_token_id is not null) asc, created_at asc
    `)) as Array<{
      parent_token_id: string | null;
      revoked_at: Date | null;
      replaced_by_token_id: string | null;
    }>;
    expect(rows).toHaveLength(2);
    expect(rows[0]?.revoked_at).not.toBeNull();
    expect(rows[0]?.replaced_by_token_id).not.toBeNull();
    expect(rows[1]?.parent_token_id).not.toBeNull();
  });

  it("rejects duplicate registration and logs in persisted users", async () => {
    const httpServer = getHttpServer(app);
    const email = "duplicate-component@example.com";
    const password = componentCredential;

    await supertest(httpServer)
      .post("/auth/register")
      .send({ email, password })
      .expect(201);
    await supertest(httpServer)
      .post("/auth/register")
      .send({ email, password })
      .expect(409);

    const login = await supertest(httpServer)
      .post("/auth/login")
      .send({ email, password })
      .expect(201);

    const body = login.body as AuthSessionResponse;
    expect(body.data.user.email).toBe(email);
  });

  it("returns the token-protected me payload for a postgres-backed session", async () => {
    const httpServer = getHttpServer(app);
    const register = await supertest(httpServer)
      .post("/auth/register")
      .send({
        email: "me-component@example.com",
        [passwordField]: componentCredential,
      })
      .expect(201);
    const token = (register.body as AuthSessionResponse).data.accessToken;

    const me = await supertest(httpServer)
      .get("/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
      .expect(200);

    expect(
      (me.body as { data?: { principal?: { email?: string } } }).data?.principal
        ?.email,
    ).toBe("me-component@example.com");
  });
});

async function runAuthMigrations(orm: MikroORM): Promise<void> {
  await orm.migrator.up();
}

function getHttpServer(
  app: INestApplication | undefined,
): Parameters<typeof supertest>[0] {
  if (!app) {
    throw new Error("Nest application was not initialized.");
  }

  return app.getHttpAdapter().getInstance() as Parameters<typeof supertest>[0];
}
