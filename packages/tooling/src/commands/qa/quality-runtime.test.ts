// @requirements REQ-SCAFFOLD-QUALITY-006
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { after, describe, it } from 'node:test';

const repo = process.cwd();
const owned = mkdtempSync(join(tmpdir(), 'nrb-quality-runtime-'));
after(() => rmSync(owned, {recursive: true, force: true}));
let counter = 0;

async function runQuality(command: string, environment: NodeJS.ProcessEnv = {}, args: string[] = [], setup?: (cwd: string) => void) {
  const cwd = join(owned, `${command}-${++counter}`);
  mkdirSync(cwd);
  setup?.(cwd);
  const env = {...process.env};
  for (const key of Object.keys(env)) if (/^(?:PERF_|A11Y_|SECURITY_DAST_|OPENAPI_FUZZ_|OPENAPI_CONTRACTS_ROOT)/u.test(key)) delete env[key];
  const report = join(cwd, 'report.json');
  const child = spawn(process.execPath, [resolve(repo, 'packages/tooling/bin/run-ts-command.mjs'),
    resolve(repo, `packages/tooling/src/commands/qa/${command}.ts`), '--report', report, ...args], {
    cwd, env: {...env, ...environment, PATH: `${join(cwd, 'bin')}${delimiter}${env.PATH ?? ''}`},
  });
  let stdout = '', stderr = '';
  child.stdout.on('data', (value) => {stdout += String(value);});
  child.stderr.on('data', (value) => {stderr += String(value);});
  const status = await new Promise<number | null>((done, reject) => {
    const timeout = setTimeout(() => {child.kill('SIGKILL'); reject(new Error('Quality fixture exceeded 30 seconds.'));}, 30000);
    child.on('error', (error) => {clearTimeout(timeout); reject(error);});
    child.on('close', (code) => {clearTimeout(timeout); done(code);});
  });
  let parsed;
  try {parsed = JSON.parse(readFileSync(report, 'utf8'));} catch { /* Invalid configuration can fail before report creation. */ }
  return {status, stdout, stderr, report: parsed, cwd};
}

async function withHttp(handler: (req: IncomingMessage, res: ServerResponse) => void, check: (url: string) => Promise<void>) {
  const server = createServer(handler);
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {await check(`http://127.0.0.1:${address.port}`);}
  finally {await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()));}
}

const html = '<!doctype html><html lang="en"><title>Fixture</title><main><h1>Fixture</h1></main></html>';
function healthy(_req: IncomingMessage, res: ServerResponse) {
  res.setHeader('content-type', 'text/html');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
  res.end(html);
}

function executable(cwd: string, name: string, code: string) {
  mkdirSync(join(cwd, 'bin'), {recursive: true});
  const file = join(cwd, 'bin', name);
  writeFileSync(file, `#!${process.execPath}\n${code}`);
  chmodSync(file, 0o755);
}

function contractFixture(cwd: string) {
  mkdirSync(join(cwd, 'contracts'));
  writeFileSync(join(cwd, 'contracts', 'fixture.json'), JSON.stringify({
    openapi: '3.1.0', info: {title: 'Fixture', version: '1'}, paths: {'/items': {
      get: {operationId: 'readItems', responses: {'200': {description: 'OK'}}},
      post: {operationId: 'createItem', requestBody: {content: {'application/json': {schema: {
        type: 'object', required: ['name'], properties: {name: {type: 'string'}},
      }}}}, responses: {'200': {description: 'OK'}, '400': {description: 'Invalid'}}},
    }},
  }));
}

void describe('real runtime quality boundaries', () => {
  for (const [command, required] of [['performance', 'PERF_REQUIRE_TARGET'], ['accessibility', 'A11Y_REQUIRE_TARGET'], ['security-dast', 'SECURITY_DAST_REQUIRE_TARGET']]) {
    void it(`${command} distinguishes required target failure, optional skip, and an explicit plan`, async () => {
      const absent = await runQuality(command, {[required]: '1'});
      assert.equal(absent.status, 1, absent.stderr);
      assert.equal(absent.report.status, 'violations');
      const optional = await runQuality(command);
      assert.equal(optional.status, 0, optional.stderr);
      assert.equal(optional.report.status, 'skipped');
      const plan = await runQuality(command, {[required]: '1'}, ['--dry-run']);
      assert.equal(plan.status, 0, plan.stderr);
      assert.equal(plan.report.status, 'dry-run');
    });
  }

  void it('rejects zero, nonfinite, and unbounded performance samples or budgets', async () => {
    for (const setting of [{PERF_API_REQUESTS: '0'}, {PERF_API_REQUESTS: 'NaN'}, {PERF_API_REQUESTS: '201'},
      {PERF_API_P95_BUDGET_MS: 'Infinity'}, {PERF_TTFB_BUDGET_MS: '-1'}, {PERF_LIGHTHOUSE_PERFORMANCE_MIN: '1.1'}]) {
      const result = await runQuality('performance', setting);
      assert.notEqual(result.status, 0, JSON.stringify(setting));
      assert.match(result.stderr, /must be/u);
    }
  });

  void it('sends a positive sample count and refuses client errors as successful API load', async () => {
    let requests = 0;
    await withHttp((_req, res) => {requests += 1; res.end('{}');}, async (url) => {
      const result = await runQuality('performance', {PERF_API_URLS: url, PERF_API_REQUESTS: '3'});
      assert.equal(result.status, 0, result.stderr);
      assert.equal(requests, 3);
      assert.equal(result.report.results[0].requests, 3);
    });
    await withHttp((_req, res) => {res.statusCode = 404; res.end('{}');}, async (url) => {
      const result = await runQuality('performance', {PERF_API_URLS: url, PERF_API_REQUESTS: '1'});
      assert.equal(result.status, 1);
    });
  });

  void it('enforces Lighthouse report scores and rejects missing or malformed score reports', async () => {
    await withHttp(healthy, async (url) => {
      for (const [payload, expected] of [[{categories: {performance: {score: 0.2}}}, 1],
        [{categories: {performance: {score: 0.9}}}, 0], [{categories: {performance: {score: null}}}, 1],
        [{runtimeError: {code: 'NO_FCP'}, categories: {performance: {score: 0.9}}}, 1], [null, 1]] as const) {
        const result = await runQuality('performance', {PERF_URLS: url}, ['--engine', 'lighthouse'], (cwd) => {
          executable(cwd, 'pnpm', `const fs = require('node:fs'); const arg = process.argv.find(x => x.startsWith('--output-path='));
            ${payload === null ? '' : `fs.writeFileSync(arg.slice('--output-path='.length), ${JSON.stringify(JSON.stringify(payload))});`}`);
        });
        assert.equal(result.status, expected, result.stderr);
        assert.equal(result.report.results.find((item: {engine: string}) => item.engine === 'lighthouse').ok, expected === 0);
      }
    });
  });

  void it('accepts a normal SPA fallback and detects recognizable environment/git exposure', async () => {
    await withHttp(healthy, async (url) => {
      const result = await runQuality('security-dast', {SECURITY_DAST_URLS: url});
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(result.report.results[0].exposedPaths, []);
    });
    await withHttp((req, res) => {
      if (req.url === '/.env') {res.setHeader('content-type', 'text/plain'); res.end('DATABASE_URL=postgres://owned:fixture@127.0.0.1/test');}
      else if (req.url === '/.git/config') {res.end('[core]\nrepositoryformatversion = 0\n');}
      else healthy(req, res);
    }, async (url) => {
      const result = await runQuality('security-dast', {SECURITY_DAST_URLS: url});
      assert.equal(result.status, 1);
      assert.deepEqual(result.report.results[0].exposedPaths, ['/.env', '/.git/config']);
      assert.ok(!JSON.stringify(result.report).includes('postgres://owned:fixture'), 'reports never copy sensitive response bodies');
    });
  });

  void it('native fuzzing sends all seeds and only sends body variants after explicit unsafe opt-in', async () => {
    const observed: Array<{method: string | undefined; seed: string | null; body: string}> = [];
    await withHttp((req, res) => {
      let body = '';
      req.on('data', (value) => {body += String(value);});
      req.on('end', () => {observed.push({method: req.method, seed: new URL(req.url ?? '/', 'http://127.0.0.1').searchParams.get('__qa_fuzz'), body}); res.end('{}');});
    }, async (url) => {
      const safe = await runQuality('openapi-fuzz', {OPENAPI_FUZZ_BASE_URL: url, OPENAPI_FUZZ_REQUIRE_TARGET: '1', OPENAPI_CONTRACTS_ROOT: 'contracts'}, [], contractFixture);
      assert.equal(safe.status, 0, safe.stderr);
      assert.deepEqual(observed.map((item) => [item.method, item.seed]), [['GET','0'], ['GET','1'], ['GET','13'], ['GET','42']]);
      observed.length = 0;
      const unsafe = await runQuality('openapi-fuzz', {OPENAPI_FUZZ_BASE_URL: url, OPENAPI_FUZZ_REQUIRE_TARGET: '1', OPENAPI_FUZZ_UNSAFE: '1', OPENAPI_CONTRACTS_ROOT: 'contracts'}, [], contractFixture);
      assert.equal(unsafe.status, 0, unsafe.stderr);
      const posts = observed.filter(({method}) => method === 'POST');
      assert.equal(posts.length, 16);
      assert.deepEqual([...new Set(posts.map(({body}) => body))].sort(), ['"__qa_invalid_type__"', 'null', '{}', '{"name":"string"}'].sort());
      assert.equal(unsafe.report.executed, 20);
    });
  });

  void it('fuzzing never labels a no-target plan as executed success', async () => {
    const result = await runQuality('openapi-fuzz', {OPENAPI_CONTRACTS_ROOT: 'contracts'}, [], contractFixture);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.report.status, 'planned');
    const required = await runQuality('openapi-fuzz', {OPENAPI_CONTRACTS_ROOT: 'contracts', OPENAPI_FUZZ_REQUIRE_TARGET: '1'}, [], contractFixture);
    assert.equal(required.status, 1);
    assert.equal(required.report.executed, 0);
  });

  void it('Schemathesis filters unsafe methods and unsafe checks before invoking the engine', async () => {
    const result = await runQuality('openapi-fuzz', {OPENAPI_CONTRACTS_ROOT: 'contracts', OPENAPI_FUZZ_BASE_URL: 'http://127.0.0.1:1'}, ['--engine','schemathesis'], (cwd) => {
      contractFixture(cwd);
      executable(cwd, 'schemathesis', "require('node:fs').writeFileSync('argv.json', JSON.stringify(process.argv.slice(2)));");
    });
    assert.equal(result.status, 0, result.stderr);
    const args = JSON.parse(readFileSync(join(result.cwd, 'argv.json'), 'utf8'));
    assert.equal(args[args.indexOf('--include-method-regex') + 1], '^(GET|HEAD|OPTIONS)$');
    assert.equal(args[args.indexOf('--phases') + 1], 'examples,fuzzing');
    assert.ok(!args[args.indexOf('--checks') + 1].includes('unsupported_method'));
  });
});
