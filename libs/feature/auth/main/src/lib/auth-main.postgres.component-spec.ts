/* eslint-disable sonarjs/no-hardcoded-passwords -- component tests use disposable local credentials only. */
import { MikroORM, type IMigrator } from "@mikro-orm/core";
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
  AuthUserEntitySchema,
  authMigrationOptions,
} from "@app/postgres-main-auth";
import { type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AuthMainModule } from "./auth-main.module";

interface AuthSessionResponse {
  data: {
    accessToken: string;
    user: { email: string; displayName?: string | null };
  };
}

const jwtSecret = "component-test-jwt-secret";

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
            [AuthUserEntitySchema],
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
    const result = (await orm.em
      .getConnection()
      .execute(
        "select column_name from information_schema.columns where table_name = 'auth_users' order by ordinal_position",
      )) as Array<{ column_name: string }>;

    expect(result.map((row) => row.column_name)).toEqual([
      "id",
      "email",
      "display_name",
      "password_hash",
      "status",
      "roles",
      "permissions",
      "last_login_at",
      "created_at",
      "updated_at",
    ]);
  });

  it("registers and persists a user through controller/service/repository wiring", async () => {
    const httpServer = getHttpServer(app);

    const response = await supertest(httpServer)
      .post("/auth/register")
      .send({
        email: "component@example.com",
        password: "component-secret",
        displayName: "Component User",
      })
      .expect(201);

    const body = response.body as AuthSessionResponse;
    expect(body.data.user).toMatchObject({
      email: "component@example.com",
      displayName: "Component User",
    });
    expect(body.data.accessToken.split(".")).toHaveLength(3);

    const persisted = (await orm.em
      .getConnection()
      .execute(
        "select email, display_name from auth_users where email = 'component@example.com'",
      )) as Array<{ email: string; display_name: string }>;
    expect(persisted).toEqual([
      { email: "component@example.com", display_name: "Component User" },
    ]);
  });

  it("rejects duplicate registration and logs in persisted users", async () => {
    const httpServer = getHttpServer(app);
    const email = "duplicate-component@example.com";
    const password = "component-secret";

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
      .send({ email: "me-component@example.com", password: "component-secret" })
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
  const migrator = (
    orm as MikroORM & { getMigrator(): IMigrator }
  ).getMigrator();
  await migrator.up();
}

function getHttpServer(
  app: INestApplication | undefined,
): Parameters<typeof supertest>[0] {
  if (!app) {
    throw new Error("Nest application was not initialized.");
  }

  return app.getHttpServer() as Parameters<typeof supertest>[0];
}
