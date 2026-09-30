// @requirements REQ-RUNTIME-OBSERVABILITY-005
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import { mongoImage, postgresImage } from './delivery-inventory.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../packages/tooling/package.json', import.meta.url));
const { GenericContainer, Wait } = require('testcontainers');
const redisImage = require('yaml').parse(
  readFileSync(new URL('../docker/docker-compose.prod.redis.yml', import.meta.url), 'utf8'),
).services.redis.image;
const exec = promisify(execFile);
const provider =
  process.env.NRB_OTEL_PROOF_PROVIDER ??
  JSON.parse(readFileSync(new URL('../.nrb/closure.json', import.meta.url), 'utf8')).provider;
assert.ok(
  ['postgres', 'mongodb'].includes(provider),
  'Select a durable provider before running its telemetry component proof',
);

test(
  `default ${provider} and Redis instrumentation exports operations without credential payloads`,
  { timeout: 120000 },
  async () => {
    const owned = [];
    const received = [];
    const collector = createServer((request, response) => {
      const chunks = [];
      request.on('data', (chunk) => chunks.push(chunk));
      request.on('end', () => {
        if (request.url === '/v1/traces') received.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        response.writeHead(200, { connection: 'close' });
        response.end('{}');
      });
    });
    await new Promise((resolve, reject) => {
      collector.once('error', reject);
      collector.listen(0, '127.0.0.1', resolve);
    });
    try {
      const database = await (
        provider === 'postgres'
          ? new GenericContainer(postgresImage)
              .withEnvironment({
                POSTGRES_DB: 'otel_owned',
                POSTGRES_USER: 'otel_owned',
                POSTGRES_PASSWORD: 'database-password-private',
              })
              .withExposedPorts(5432)
              .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
          : new GenericContainer(mongoImage)
              .withEnvironment({
                MONGO_INITDB_ROOT_USERNAME: 'mongo-user-private',
                MONGO_INITDB_ROOT_PASSWORD: 'mongo-password-private',
              })
              .withExposedPorts(27017)
              .withWaitStrategy(Wait.forLogMessage(/Waiting for connections/, 2))
      )
        .withStartupTimeout(60000)
        .start();
      owned.push(database);
      const redis = await new GenericContainer(redisImage)
        .withCommand(['redis-server', '--requirepass', 'redis-password-private'])
        .withExposedPorts(6379)
        .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
        .withStartupTimeout(30000)
        .start();
      owned.push(redis);
      const databaseUrl =
        provider === 'postgres'
          ? `postgres://otel_owned:database-password-private@${database.getHost()}:${database.getMappedPort(5432)}/otel_owned`
          : `mongodb://mongo-user-private:mongo-password-private@${database.getHost()}:${database.getMappedPort(27017)}/otel_owned?authSource=admin`;
      const redisUrl = `redis://:redis-password-private@${redis.getHost()}:${redis.getMappedPort(6379)}`;
      const collectorUrl = `http://127.0.0.1:${collector.address().port}`;
      const runtime = `
      const { createJiti } = require('jiti');
      const jiti = createJiti(process.cwd() + '/otel-owned-component.cjs');
      (async () => {
        const common = await jiti.import(process.argv[1]);
        const adapter = await jiti.import(process.argv[2]);
        const provider = process.argv[3];
        const providerInstrumentation = provider === 'postgres'
          ? adapter.createPostgresOpenTelemetryInstrumentations()
          : adapter.createMongoOpenTelemetryInstrumentations();
        const { NodeSDK } = require('@opentelemetry/sdk-node');
        const sdk = new NodeSDK(common.createOpenTelemetrySdkConfig({
          serviceName: 'owned-provider-privacy',
          instrumentations: common.createOpenTelemetryInstrumentations(providerInstrumentation),
        }, { OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OWNED_COLLECTOR_URL }));
        sdk.start();
        const { trace } = require('@opentelemetry/api');
        const { createClient } = require('redis');
        const redis = createClient({ url: process.env.OWNED_REDIS_URL });
        redis.on('error', () => {});
        try {
          await trace.getTracer('owned-component').startActiveSpan('owned-operations', async span => {
            try {
              await redis.connect();
              await redis.set('redis-key-private', 'redis-value-private');
              if (await redis.get('redis-key-private') !== 'redis-value-private') throw new Error('Redis fixture round trip failed');
              if (provider === 'postgres') {
                const { Client } = require('pg');
                const client = new Client({ connectionString: process.env.OWNED_DATABASE_URL });
                await client.connect();
                try {
                  const result = await client.query("SELECT 'sql-literal-private' AS literal, $1::text AS parameter", ['sql-parameter-private']);
                  if (result.rows[0].parameter !== 'sql-parameter-private') throw new Error('PostgreSQL fixture round trip failed');
                  await client.query('SELECT missing-column-private').catch(() => {});
                } finally { await client.end(); }
              } else {
                const { MongoClient } = require('mongodb');
                const client = new MongoClient(process.env.OWNED_DATABASE_URL);
                await client.connect();
                try {
                  const collection = client.db().collection('owned_documents');
                  await collection.insertOne({ credential: 'mongo-value-private' });
                  if (!await collection.findOne({ credential: 'mongo-value-private' })) throw new Error('Mongo fixture round trip failed');
                } finally { await client.close(); }
              }
            } finally { span.end(); }
          });
        } finally {
          if (redis.isOpen) await redis.quit();
          await sdk.shutdown();
        }
      })().catch(() => { console.error('Owned telemetry component failed'); process.exitCode = 1; });
    `;
      await exec(
        process.execPath,
        [
          '--eval',
          runtime,
          `${root}libs/backend/common/otel/lib/src/factory/otel-sdk-config.factory.ts`,
          `${root}libs/backend/${provider}/main/shared/lib/src/${provider === 'postgres' ? 'postgres' : 'mongo'}-otel.instrumentation.ts`,
          provider,
        ],
        {
          cwd: root,
          timeout: 45000,
          env: {
            NODE_ENV: 'test',
            OWNED_DATABASE_URL: databaseUrl,
            OWNED_REDIS_URL: redisUrl,
            OWNED_COLLECTOR_URL: collectorUrl,
            OTEL_RESOURCE_ATTRIBUTES: 'credential=ambient-resource-private',
          },
        },
      );
      const scopes = received
        .flatMap((payload) => payload.resourceSpans ?? [])
        .flatMap((resource) => resource.scopeSpans ?? []);
      for (const name of [
        '@opentelemetry/instrumentation-redis',
        `@opentelemetry/instrumentation-${provider === 'postgres' ? 'pg' : 'mongodb'}`,
      ]) {
        assert.ok(
          scopes.some((scope) => scope.scope.name === name && scope.spans.length > 0),
          `${name} produced no actual spans`,
        );
      }
      const serialized = JSON.stringify(received);
      for (const secret of [
        'database-password-private',
        'redis-password-private',
        'redis-key-private',
        'redis-value-private',
        'sql-literal-private',
        'sql-parameter-private',
        'missing-column-private',
        'mongo-user-private',
        'mongo-password-private',
        'mongo-value-private',
        'ambient-resource-private',
      ]) {
        assert.equal(serialized.includes(secret), false, 'A fixture credential or payload reached the collector');
      }
      assert.ok(
        scopes
          .flatMap((scope) => scope.spans)
          .some((span) => span.attributes.some((attribute) => ['db.system.name', 'db.system'].includes(attribute.key))),
        'Database operation metadata must survive privacy filtering',
      );
    } finally {
      await new Promise((resolve, reject) => collector.close((error) => (error ? reject(error) : resolve())));
      const cleanup = await Promise.allSettled(owned.reverse().map((container) => container.stop()));
      const failures = cleanup.filter((result) => result.status === 'rejected');
      assert.equal(failures.length, 0, 'Owned telemetry containers failed cleanup');
    }
  },
);
