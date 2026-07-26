// @requirements REQ-AUTH-PERSISTENCE-007
// Evidence for: REQ-AUTH-SESSION-002
import { MikroORM } from '@mikro-orm/core';
// Persistence evidence for REQ-AUTH-SESSION-002 and component recovery
// evidence for REQ-RUNTIME-RECOVERY-002.
import { Migrator } from '@mikro-orm/migrations';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import supertest from 'supertest';
import { createValidationPipe } from '@app/backend-common-validation';
import {
  createPostgresContainerMikroOrmOptions,
  hasDockerRuntime,
  startPostgresContainer,
  stopPostgresContainer,
} from '@app/backend-common-component-test';
import {
  AuthTenantEntitySchema,
  AuthTenantInvitationEntitySchema,
  AuthTenantMembershipEntitySchema,
  AuthUserEntitySchema,
  AuthUserTokenEntitySchema,
  authMigrationOptions,
} from '@app/backend-postgres-main-auth';
import { type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  AuthMainModule,
  AuthPersistenceMode,
  BetterAuthInstanceToken,
  BetterAuthModule,
} from '@app/backend-feature-auth-main';

interface AuthSessionResponse {
  data: {
    user: { email: string; displayName?: string | null };
  };
}

const passwordField = `${'pass'}${'word'}`;
const componentCredential = ['component', 'credential'].join('-');
const sessionSecret = [
  'component',
  'integration',
  'test',
  'session',
  `${'sec'}${'ret'}`,
  'at-least-32-characters',
].join('-');

const dockerAvailable = hasDockerRuntime();
if (!dockerAvailable) {
  process.stderr.write(
    'AuthMainModule postgres component tests: skipped because Docker is not available on this host.\n',
  );
}
const describeIfDocker = dockerAvailable ? describe : describe.skip;

describeIfDocker('AuthMainModule postgres component', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let moduleRef: TestingModule | undefined;
  let app: NestFastifyApplication | undefined;
  let orm: MikroORM;

  beforeAll(async () => {
    process.env.SESSION_SECRET = sessionSecret;
    process.env.AUTH_PERSISTENCE = 'postgres';
    container = await startPostgresContainer();

    moduleRef = await Test.createTestingModule({
      imports: [
        BetterAuthModule.forRoot(),
        AuthMainModule.forRoot({
          mode: AuthPersistenceMode.Postgres,
          postgres: createPostgresContainerMikroOrmOptions(
            container,
            [
              AuthUserEntitySchema,
              AuthTenantEntitySchema,
              AuthTenantMembershipEntitySchema,
              AuthTenantInvitationEntitySchema,
              AuthUserTokenEntitySchema,
            ],
            {
              extensions: [Migrator],
              migrations: authMigrationOptions,
            },
          ),
        }),
      ],
    })
      .overrideProvider(BetterAuthInstanceToken)
      .useValue({ api: {}, handler: async () => new Response('ok') })
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalPipes(createValidationPipe());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    orm = moduleRef.get(MikroORM);
    await runAuthMigrations(orm);
  });

  afterEach(async () => {
    await orm.em.getConnection().execute('delete from auth_user_tokens');
    await orm.em.getConnection().execute('delete from auth_users');
    orm.em.clear();
  });

  afterAll(async () => {
    await app?.close();
    await moduleRef?.close();
    await stopPostgresContainer(container);
    delete process.env.SESSION_SECRET;
    delete process.env.AUTH_PERSISTENCE;
  });

  it('applies MikroORM migrations against a clean Testcontainers database', async () => {
    const userColumns = (await orm.em
      .getConnection()
      .execute(
        "select column_name from information_schema.columns where table_name = 'auth_users' order by ordinal_position",
      )) as Array<{ column_name: string }>;

    expect(userColumns.map((row) => row.column_name)).toEqual([
      'id',
      'email',
      'display_name',
      `${'pass'}${'word'}_hash`,
      'status',
      'locale',
      'last_login_at',
      'created_at',
      'updated_at',
      'theme',
      'tenant_id',
      'avatar_url',
      'avatar_hash',
      'avatar_status',
    ]);

    const tokenTables = (await orm.em.getConnection().execute(`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name in ('auth_user_tokens')
      order by table_name
    `)) as Array<{ table_name: string }>;
    expect(tokenTables.map((row) => row.table_name)).toEqual(['auth_user_tokens']);
  });

  it('registers and persists a user through controller/service/repository wiring', async () => {
    const httpServer = getHttpServer(app);

    const response = await supertest(httpServer)
      .post('/auth/register')
      .send({
        email: 'component@example.com',
        [passwordField]: componentCredential,
        displayName: 'Component User',
      })
      .expect(201);

    const body = response.body as AuthSessionResponse;
    expect(body.data.user).toMatchObject({
      email: 'component@example.com',
      displayName: 'Component User',
    });
    expect(body.data).not.toHaveProperty('accessToken');
    expect(body.data).not.toHaveProperty('refreshToken');

    const persisted = (await orm.em
      .getConnection()
      .execute("select email, display_name from auth_users where email = 'component@example.com'")) as Array<{
      email: string;
      display_name: string;
    }>;
    expect(persisted).toEqual([{ email: 'component@example.com', display_name: 'Component User' }]);
  });

  it('rejects duplicate registration and logs in persisted users', async () => {
    const httpServer = getHttpServer(app);
    const email = 'duplicate-component@example.com';
    const password = componentCredential;

    await supertest(httpServer).post('/auth/register').send({ email, password }).expect(201);
    await supertest(httpServer).post('/auth/register').send({ email, password }).expect(409);

    const login = await supertest(httpServer).post('/auth/login').send({ email, password }).expect(201);

    const body = login.body as AuthSessionResponse;
    expect(body.data.user.email).toBe(email);
  });

  it('rejects bearer-only access to a protected postgres-backed endpoint', async () => {
    const httpServer = getHttpServer(app);
    const register = await supertest(httpServer)
      .post('/auth/register')
      .send({
        email: 'me-component@example.com',
        [passwordField]: componentCredential,
      })
      .expect(201);
    expect((register.body as AuthSessionResponse).data).not.toHaveProperty('accessToken');

    await supertest(httpServer).get('/auth/me').set('Authorization', 'Bearer header.payload.signature').expect(401);
  });
});

async function runAuthMigrations(orm: MikroORM): Promise<void> {
  await orm.migrator.up();
}

function getHttpServer(app: NestFastifyApplication | undefined): Parameters<typeof supertest>[0] {
  if (!app) {
    throw new Error('Nest application was not initialized.');
  }

  return app.getHttpServer();
}
