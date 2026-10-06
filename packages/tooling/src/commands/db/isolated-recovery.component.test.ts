// @requirements REQ-RUNTIME-RECOVERY-002
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { promisify } from 'node:util';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { MongoDBContainer } from '@testcontainers/mongodb';
import { MongoClient } from 'mongodb';
import pg from 'pg';
import { createPostgresClientInvocation } from './postgres-client.ts';
import { createMongoClientInvocation } from './mongo-client.ts';

// This file is also the default operational drill. A skip would falsely certify recovery.
if (process.env.SKIP_INTEGRATION === '1') throw new Error('The required isolated recovery drill cannot skip its owned database fixtures.');
const execute = promisify(execFile);
const payloads = [{id: 1, payload: {nested: {value: 'before restore'}, amount: '12.34'}},
  {id: 2, payload: {active: true, unicode: '测试'}}];

async function runClient(invocation: {command: string; args: string[]; env: NodeJS.ProcessEnv}) {
  await execute(invocation.command, invocation.args, {env: invocation.env, timeout: 180000, maxBuffer: 2 * 1024 * 1024});
}

void describe('actual backup clients restore only into independently owned fixtures', () => {
  void it('preserves PostgreSQL data and constraints without changing the source database', {timeout: 240000}, async () => {
    const directory = mkdtempSync(join(tmpdir(), 'nrb-pg-recovery-'));
    let container: Awaited<ReturnType<PostgreSqlContainer['start']>> | undefined;
    let source: pg.Client | undefined, target: pg.Client | undefined;
    try {
      container = await new PostgreSqlContainer('postgres:17.11-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24').withDatabase('nrb_test_source').start();
      source = new pg.Client({connectionString: container.getConnectionUri()});
      await source.connect();
      await source.query('CREATE DATABASE nrb_test_restore');
      await source.query('CREATE TABLE recovery_roundtrip(id integer PRIMARY KEY, payload jsonb NOT NULL)');
      for (const record of payloads) await source.query('INSERT INTO recovery_roundtrip VALUES ($1,$2)', [record.id, record.payload]);
      const archive = join(directory, 'source.dump');
      const env = {DB_BACKUP_USE_DOCKER: '1', POSTGRES_CLIENT_DOCKER_IMAGE: 'postgres:17.11-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24'};
      const backup = createPostgresClientInvocation({connectionString: container.getConnectionUri(), operation: 'backup', outputPath: archive, env});
      assert.equal(backup.mode, 'docker');
      await runClient(backup.selected);
      assert.ok(statSync(archive).size > 0);
      const targetUrl = new URL(container.getConnectionUri());
      targetUrl.pathname = '/nrb_test_restore';
      const restore = createPostgresClientInvocation({connectionString: targetUrl.toString(), operation: 'restore', outputPath: archive, env});
      await runClient(restore.selected);
      target = new pg.Client({connectionString: targetUrl.toString()});
      await target.connect();
      assert.deepEqual((await target.query('SELECT id,payload FROM recovery_roundtrip ORDER BY id')).rows, payloads);
      await assert.rejects(target.query('INSERT INTO recovery_roundtrip VALUES (1,$1)', [{}]), {code: '23505'});
      assert.deepEqual((await source.query('SELECT id,payload FROM recovery_roundtrip ORDER BY id')).rows, payloads);
    } finally {
      try {await Promise.all([source?.end(), target?.end()]);}
      finally {await container?.stop(); rmSync(directory, {recursive: true, force: true});}
    }
  });

  void it('preserves MongoDB documents, validators, and indexes in a separate owned replica set', {timeout: 300000}, async () => {
    const directory = mkdtempSync(join(tmpdir(), 'nrb-mongo-recovery-'));
    let sourceContainer: Awaited<ReturnType<MongoDBContainer['start']>> | undefined;
    let targetContainer: Awaited<ReturnType<MongoDBContainer['start']>> | undefined;
    let source: MongoClient | undefined, target: MongoClient | undefined;
    const database = 'nrb_recovery_test';
    const connection = (value: string) => {const url = new URL(value); url.pathname = `/${database}`; url.searchParams.set('directConnection', 'true'); url.searchParams.set('replicaSet', 'rs0'); return url.toString();};
    try {
      sourceContainer = await new MongoDBContainer('mongo:8.0.32-noble@sha256:0393ab544cbbe92b2dd64719205ecb14a8b3824b17ea75051e2f22482c3e4e66').start();
      targetContainer = await new MongoDBContainer('mongo:8.0.32-noble@sha256:0393ab544cbbe92b2dd64719205ecb14a8b3824b17ea75051e2f22482c3e4e66').start();
      const sourceUrl = connection(sourceContainer.getConnectionString());
      const targetUrl = connection(targetContainer.getConnectionString());
      assert.notEqual(sourceUrl, targetUrl);
      source = new MongoClient(sourceUrl); target = new MongoClient(targetUrl);
      await source.connect(); await target.connect();
      await source.db(database).createCollection('recovery_roundtrip', {validator: {$jsonSchema: {bsonType: 'object', required: ['id', 'payload'], properties: {id: {bsonType: 'number'}, payload: {bsonType: 'object'}}}}});
      const original = source.db(database).collection('recovery_roundtrip');
      await original.createIndex({id: 1}, {unique: true});
      await original.insertMany(payloads.map((record) => ({...record})));
      const expected = await original.find({}).sort({id: 1}).toArray();
      const archive = join(directory, 'source.archive.gz');
      const env = {MONGODB_DATABASE_TOOLS_USE_DOCKER: '1'};
      const backup = createMongoClientInvocation({connectionString: sourceUrl, database, operation: 'backup', archivePath: archive, env});
      assert.equal(backup.mode, 'docker');
      await runClient(backup.selected);
      assert.ok(statSync(archive).size > 0);
      const restore = createMongoClientInvocation({connectionString: targetUrl, database, operation: 'restore', archivePath: archive, env});
      await runClient(restore.selected);
      const restored = target.db(database).collection('recovery_roundtrip');
      assert.deepEqual(await restored.find({}).sort({id: 1}).toArray(), expected);
      await assert.rejects(restored.insertOne({id: 1, payload: {}}), {code: 11000});
      await assert.rejects(restored.insertOne({id: 3}), {code: 121});
      assert.deepEqual(await original.find({}).sort({id: 1}).toArray(), expected);
    } finally {
      try {await Promise.all([source?.close(), target?.close()]);}
      finally {await Promise.all([sourceContainer?.stop(), targetContainer?.stop()]); rmSync(directory, {recursive: true, force: true});}
    }
  });
});
