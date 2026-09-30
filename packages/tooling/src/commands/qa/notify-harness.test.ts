// @requirements REQ-RUNTIME-STORAGE-007 REQ-SCAFFOLD-SAFETY-008
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { chmod, lstat, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

const { startMockTransports } = await import(resolve(import.meta.dirname,
  '../../../../../scripts/integration-harness/notify/mock-transports.mjs'));

const { notificationFixtureDatabase } = await import(resolve(import.meta.dirname,
  '../../../../../scripts/integration-harness/notify/fixture-config.mjs'));

describe('notification fixture database selection', () => {
  it('requires an explicit owned local target and never falls back to a runtime URL', () => {
    assert.throws(() => notificationFixtureDatabase({ DATABASE_URL: 'postgres://127.0.0.1/product' }),
      /NRB_NOTIFY_TEST_DATABASE_URL/);
    for (const selected of ['postgres://db.example.com/nrb_test', 'postgres://127.0.0.1/product',
      'mongodb://localhost/nrb_test', 'invalid', 'postgres://localhost/%E0%A4%A']) {
      assert.throws(() => notificationFixtureDatabase({ NRB_NOTIFY_TEST_DATABASE_URL: selected }));
    }
    const selected = 'postgres://127.0.0.1/nrb_test';
    assert.equal(notificationFixtureDatabase({ NRB_NOTIFY_TEST_DATABASE_URL: selected }), selected);
    assert.throws(() => notificationFixtureDatabase({ NRB_NOTIFY_TEST_DATABASE_URL: selected, NODE_ENV: 'production' }),
      /production mode/);
  });
});

interface Fixture {
  s3Store: string;
  callsLog: string;
  ports: Record<string, number>;
  close(): Promise<void>;
}

describe('local notification object-store authority', () => {
  let directory: string;
  let sentinel: string;
  let fixture: Fixture;
  before(async () => {
    directory = await mkdtemp(join(tmpdir(), 'nrb-notify-path-test-'));
    sentinel = join(directory, 'sentinel.txt');
    await writeFile(sentinel, 'external-private-bytes');
    await writeFile(`${sentinel}.meta.json`, 'external-private-metadata');
    fixture = await startMockTransports({ directory: join(directory, 'state'),
      ports: { s3: 0, email: 0, telegram: 0, discord: 0 }, onEvent: () => undefined });
  });
  after(async () => {
    try { await fixture?.close(); }
    finally { if (directory) await rm(directory, { recursive: true, force: true }); }
  });

  it('round-trips nested objects and metadata, lists a bucket, and keeps roots private', async () => {
    assert.equal((await lstat(fixture.s3Store)).mode & 0o077, 0);
    assert.equal((await http('PUT', '/bucket/nested/file..csv', 'a,b\n1,2', {
      'content-type': 'text/csv', 'x-amz-meta-purpose': 'segment',
    })).status, 200);
    const get = await http('GET', '/bucket/nested/file..csv');
    assert.equal(get.status, 200);
    assert.equal(get.body, 'a,b\n1,2');
    assert.equal(get.headers['x-amz-meta-purpose'], 'segment');
    assert.equal((await http('HEAD', '/bucket/nested/file..csv')).body, '');
    assert.equal((await http('GET', '/bucket/?list-type=2')).status, 200);
    assert.equal((await http('DELETE', '/bucket/nested/file..csv')).status, 204);
    assert.equal((await http('GET', '/bucket/nested/file..csv')).status, 404);
  });

  it('rejects absolute, encoded traversal, malformed, and empty key components for all methods', async () => {
    const paths = [`/bucket/${sentinel}`, '/bucket/%2e%2e/sentinel.txt',
      '/bucket/a/%2e%2e/file', '/bucket/%2Ftmp/file', '/bucket/a%5Cb',
      '/bucket/%00file', '/bucket/%E0%A4%A', '/bucket/a//file'];
    for (const method of ['GET', 'HEAD', 'PUT', 'DELETE']) {
      for (const path of paths) assert.equal((await http(method, path, 'attempted-write')).status, 400,
        `${method} ${path}`);
    }
    await unchanged();
  });

  it('rejects symlinked directories, objects, and metadata before get/head/put/delete', async () => {
    const bucket = join(fixture.s3Store, 'bucket');
    await mkdir(bucket, { recursive: true, mode: 0o700 });
    await symlink(directory, join(bucket, 'linked-directory'));
    await symlink(sentinel, join(bucket, 'linked-object'));
    await writeFile(join(bucket, 'metadata-target'), 'safe-object');
    await symlink(`${sentinel}.meta.json`, join(bucket, 'metadata-target.meta.json'));
    for (const method of ['GET', 'HEAD', 'PUT', 'DELETE']) {
      for (const path of ['/bucket/linked-directory/sentinel.txt', '/bucket/linked-object',
        '/bucket/metadata-target']) {
        assert.equal((await http(method, path, 'attempted-write')).status, 400, `${method} ${path}`);
      }
    }
    await unchanged();
    assert.equal(await readFile(join(bucket, 'metadata-target'), 'utf8'), 'safe-object');
  });

  it('bounds request bodies without making the fixture unavailable', async () => {
    assert.equal((await http('PUT', '/bucket/oversized', Buffer.alloc(8 * 1024 * 1024 + 1))).status, 413);
    assert.equal((await http('GET', '/health')).status, 200);
    assert.equal((await http('GET', '/bucket/oversized')).status, 404);
  });

  it('omits credentials and raw message bodies from persisted logs', async () => {
    const response = await fetch(`http://127.0.0.1:${fixture.ports.telegram}/botsynthetic-secret/sendMessage?token=synthetic-query-secret`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'synthetic-header-secret' },
      body: JSON.stringify({ text: 'synthetic-private-message', token: 'synthetic-body-secret' }),
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(response.status, 200);
    // Logs finish asynchronously after the response; await their specific safe entry.
    let log = '';
    for (let attempt = 0; attempt < 20; attempt += 1) {
      log = await readFile(fixture.callsLog, 'utf8');
      if (log.includes('/bot[redacted]/sendMessage')) break;
      await new Promise((done) => setTimeout(done, 10));
    }
    assert.match(log, /\/bot\[redacted\]\/sendMessage/);
    assert.doesNotMatch(log, /synthetic-(secret|query-secret|header-secret|body-secret|private-message)/);
  });

  it('refuses a shared or symlinked state root', async () => {
    const shared = join(directory, 'shared');
    await mkdir(shared);
    await chmod(shared, 0o755);
    await assert.rejects(startMockTransports({ directory: shared }), /private current-user-owned/);
    const linked = join(directory, 'linked-root');
    await symlink(join(directory, 'state'), linked);
    await assert.rejects(startMockTransports({ directory: linked }), /private current-user-owned/);
  });

  async function unchanged() {
    assert.equal(await readFile(sentinel, 'utf8'), 'external-private-bytes');
    assert.equal(await readFile(`${sentinel}.meta.json`, 'utf8'), 'external-private-metadata');
  }

  function http(method: string, path: string, body: string | Buffer = '', headers = {}): Promise<{
    status: number; body: string; headers: Record<string, string | string[] | undefined>;
  }> {
    return new Promise((done, reject) => {
      // Raw HTTP preserves malicious dot segments that fetch/URL would normalize.
      const outgoing = request({ host: '127.0.0.1', port: fixture.ports.s3, method, path,
        headers: { ...headers, 'content-length': Buffer.byteLength(body) }, timeout: 5000 }, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => done({ status: response.statusCode ?? 0,
          body: Buffer.concat(chunks).toString(), headers: response.headers }));
        response.on('error', reject);
      });
      outgoing.on('timeout', () => outgoing.destroy(new Error('Fixture request timeout.')));
      outgoing.on('error', reject);
      outgoing.end(body);
    });
  }
});
