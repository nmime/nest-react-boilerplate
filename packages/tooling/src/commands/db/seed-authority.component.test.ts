// @requirements REQ-SCAFFOLD-SAFETY-008 REQ-SCAFFOLD-INIT-004
import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { probePostgresMigrationState } from '../../reconfigure/io.ts';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { MongoDBContainer, type StartedMongoDBContainer } from '@testcontainers/mongodb';
import { MongoClient, type Document } from 'mongodb';
import pg from 'pg';
import { runMongoMigrations } from '../../../../../libs/backend/mongodb/main/shared/lib/src/migrations/mongo-migration.ts';
import { mongoMigrations } from './mongo-migrate.ts';
import { seedMongoBootstrap } from './mongo-seed.ts';
import { seed } from './postgres-seed.ts';
import { DefaultTenantId, buildSeedUsers } from './seed-data.ts';

const dockerAvailable = process.env.SKIP_INTEGRATION !== '1' &&
  spawnSync('docker', ['info'], { timeout: 10_000, stdio: 'ignore' }).status === 0;
const workspaceRoot = resolve(import.meta.dirname, '../../../../..');
type StringIdDocument = Document & { _id: string };

describe('privileged seed authority on owned real databases', {
  skip: dockerAvailable ? false : 'Owned Docker fixtures are unavailable',
}, () => {
  let postgres: StartedPostgreSqlContainer;
  let mongo: StartedMongoDBContainer;
  let sql: pg.Client;
  let mongoClient: MongoClient;
  const users = buildSeedUsers('First-unique-password-123!', 'zh', {
    email: 'selected-owner@example.com', displayName: 'Selected Owner', includeDemoUsers: false,
  });

  before(async () => {
    // No ambient DATABASE_URL or MONGODB_URI is accepted by this fixture.
    postgres = await new PostgreSqlContainer('postgres:17.11-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24').start();
    const runProbe = () => probePostgresMigrationState(postgres.getConnectionUri(), workspaceRoot,
      async (statement) => {
        const result = await postgres.exec(['psql', '-U', postgres.getUsername(), '-d', postgres.getDatabase(),
          '--no-psqlrc', '--tuples-only', '--no-align', '--command', statement]);
        return { status: result.exitCode, stdout: result.output, stderr: result.output };
      });
    const oldQuery = await postgres.exec(['psql', '-U', postgres.getUsername(), '-d', postgres.getDatabase(),
      '--command', "SELECT CASE WHEN to_regclass('public.mikro_orm_migrations') IS NULL THEN 'fresh' WHEN EXISTS (SELECT 1 FROM public.mikro_orm_migrations) THEN 'applied' ELSE 'fresh' END;"]);
    assert.notEqual(oldQuery.exitCode, 0, 'the former CASE probe references an absent relation');
    assert.equal((await runProbe()).stdout, 'fresh');
    await postgres.exec(['psql', '-U', postgres.getUsername(), '-d', postgres.getDatabase(), '--command',
      'CREATE TABLE public.mikro_orm_migrations (name text);']);
    assert.equal((await runProbe()).stdout.trim(), 'fresh');
    await postgres.exec(['psql', '-U', postgres.getUsername(), '-d', postgres.getDatabase(), '--command',
      "INSERT INTO public.mikro_orm_migrations VALUES ('fixture');"]);
    assert.equal((await runProbe()).stdout.trim(), 'applied');
    await postgres.exec(['psql', '-U', postgres.getUsername(), '-d', postgres.getDatabase(), '--command',
      'DROP TABLE public.mikro_orm_migrations;']);
    const migratePath = resolve(workspaceRoot, 'packages/tooling/src/commands/db/migrate.ts');
    const runtimePath = resolve(workspaceRoot, 'libs/common/i18n/runtime/lib/src/index.ts');
    const script = `const { createJiti } = await import('jiti');
      const jiti = createJiti(import.meta.url, { alias: {
        '@app/common-i18n-runtime': ${JSON.stringify(runtimePath)} } });
      const { runDatabaseMigrations } = await jiti.import(${JSON.stringify(migratePath)});
      await runDatabaseMigrations('postgres');`;
    await promisify(execFile)(process.execPath, ['--input-type=module', '--eval', script], {
      cwd: workspaceRoot, timeout: 180_000, maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, NODE_ENV: 'test', AUTH_PERSISTENCE: 'postgres',
        DATABASE_ENGINE: 'postgres', DATABASE_URL: postgres.getConnectionUri(), POSTGRES_SSL: 'false' },
    });
    sql = new pg.Client({ connectionString: postgres.getConnectionUri() });
    await sql.connect();
    mongo = await new MongoDBContainer('mongo:8.0.32-noble@sha256:0393ab544cbbe92b2dd64719205ecb14a8b3824b17ea75051e2f22482c3e4e66').start();
    const url = new URL(mongo.getConnectionString());
    url.searchParams.set('directConnection', 'true');
    url.searchParams.set('replicaSet', 'rs0');
    mongoClient = new MongoClient(url.toString());
    await mongoClient.connect();
    await runMongoMigrations(mongoClient.db('seed_authority_test'), mongoMigrations);
  }, { timeout: 240_000 });

  after(async () => {
    try { await Promise.all([sql?.end(), mongoClient?.close()]); }
    finally { await Promise.all([postgres?.stop(), mongo?.stop()]); }
  }, { timeout: 30_000 });

  it('rolls back a PostgreSQL public-email collision and preserves canonical seed credentials on replay', async () => {
    const publicId = randomUUID();
    await sql.query(`INSERT INTO auth_users (id, tenant_id, email, display_name, password_hash, status)
      VALUES ($1, $2, $3, 'Public User', 'public-original-hash', 'active')`,
    [publicId, DefaultTenantId, users[0].email]);
    const baseline = await sql.query('SELECT count(*)::int AS count FROM auth_role_permissions');
    await assert.rejects(seed(sql, users), /not the canonical seed owner/);
    assert.deepEqual((await sql.query('SELECT id, password_hash FROM auth_users')).rows,
      [{ id: publicId, password_hash: 'public-original-hash' }]);
    assert.equal((await sql.query('SELECT count(*)::int AS count FROM auth_user_roles')).rows[0].count, 0);
    assert.deepEqual((await sql.query('SELECT count(*)::int AS count FROM auth_role_permissions')).rows, baseline.rows);
    await sql.query('DELETE FROM auth_users WHERE id = $1', [publicId]);
    assert.equal((await seed(sql, users)).users, 1);
    const first = (await sql.query('SELECT id, email, display_name, password_hash FROM auth_users')).rows;
    assert.equal(first[0].email, users[0].email);
    assert.equal(first[0].display_name, 'Selected Owner');
    assert.match(first[0].password_hash, /^pbkdf2_sha256\$/);
    assert.equal((await seed(sql, [{ ...users[0], password: 'Second-password-must-not-replace!' }])).users, 0);
    assert.deepEqual((await sql.query('SELECT id, email, display_name, password_hash FROM auth_users')).rows, first);
    assert.equal((await sql.query('SELECT count(*)::int AS count FROM auth_users')).rows[0].count, 1);
    assert.equal((await sql.query('SELECT count(*)::int AS count FROM auth_user_roles')).rows[0].count, 1);
  });

  it('rolls back a MongoDB public-email collision and preserves canonical seed credentials on replay', async () => {
    const database = mongoClient.db('seed_authority_test');
    const publicId = randomUUID();
    const now = new Date();
    await database.collection<StringIdDocument>('auth_users').insertOne({
      _id: publicId, tenantId: DefaultTenantId, email: users[0].email, displayName: 'Public User',
      passwordHash: 'public-original-hash', status: 'active', locale: 'en', theme: 'system',
      lastLoginAt: new Date(0), avatarUrl: '', avatarHash: '', avatarStatus: 'none', createdAt: now, updatedAt: now,
    });
    const bootstrap = (seedUsers = users) => mongoClient.withSession((session) =>
      session.withTransaction(() => seedMongoBootstrap(database, seedUsers, session)));
    const baseline = await database.collection('auth_role_permissions').countDocuments();
    await assert.rejects(bootstrap(), /not the canonical seed owner/);
    const publicUser = await database.collection<StringIdDocument>('auth_users').findOne({ _id: publicId });
    assert.equal(publicUser?.passwordHash, 'public-original-hash');
    assert.equal(await database.collection('auth_user_roles').countDocuments(), 0);
    assert.equal(await database.collection('auth_role_permissions').countDocuments(), baseline);
    await database.collection<StringIdDocument>('auth_users').deleteOne({ _id: publicId });
    assert.equal((await bootstrap())?.users, 1);
    const first = await database.collection('auth_users').findOne();
    assert.equal(first?.email, users[0].email);
    assert.equal(first?.displayName, 'Selected Owner');
    assert.match(String(first?.passwordHash), /^pbkdf2_sha256\$/);
    assert.equal((await bootstrap([{ ...users[0], password: 'Second-password-must-not-replace!' }]))?.users, 0);
    assert.deepEqual(await database.collection('auth_users').findOne(), first);
    assert.equal(await database.collection('auth_users').countDocuments(), 1);
    assert.equal(await database.collection('auth_user_roles').countDocuments(), 1);
  });
});
