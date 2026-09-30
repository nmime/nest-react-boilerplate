// @requirements REQ-RUNTIME-OBSERVABILITY-005 REQ-RUNTIME-DELIVERY-009
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { localObservabilityImages } from './delivery-inventory.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const docker = (...args) =>
  execFileSync('docker', args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 180000,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
const json = async (url, options) => {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200, new URL(url).pathname);
  return response.json();
};
async function until(operation) {
  let error;
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      return await operation();
    } catch (caught) {
      error = caught;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw error;
}

test(
  'the opt-in local stack accepts owned telemetry and denies anonymous administration',
  { timeout: 240000 },
  async () => {
    const directory = mkdtempSync(join(tmpdir(), 'nrb-local-observability-'));
    const project = `nrb-local-observe-${randomUUID().slice(0, 8)}`;
    const composeFile = join(directory, 'compose.json');
    const source = parse(readFileSync(join(root, 'docker-compose.override.yml'), 'utf8'));
    const services = Object.fromEntries(
      Object.entries(source.services).map(([name, service]) => [
        name,
        {
          ...service,
          image: localObservabilityImages[name],
          profiles: undefined,
          ports: service.ports.map((port) => `127.0.0.1::${port.split(':').at(-1)}`),
          volumes: service.volumes?.map((volume) => volume.replace(/^\.\//u, `${root}/`)),
          ...(service.healthcheck
            ? {
                healthcheck: { ...service.healthcheck, interval: '1s', timeout: '5s', retries: 80, start_period: '1s' },
              }
            : {}),
        },
      ]),
    );
    writeFileSync(composeFile, JSON.stringify({ services }));
    const compose = (...args) =>
      docker('compose', '--env-file', '/dev/null', '-p', project, '-f', composeFile, ...args);
    let started = false;
    try {
      started = true;
      compose('up', '-d', '--wait', '--wait-timeout', '120');
      const rows = JSON.parse(
        compose('ps', '--format', 'json')
          .split('\n')
          .map((row) => row.trim())
          .filter(Boolean)
          .join(',')
          .replace(/^/u, '[')
          .replace(/$/u, ']'),
      );
      assert.equal(rows.length, 3);
      const port = (name, privatePort) => {
        const row = rows.find(({ Service }) => Service === name);
        assert.ok(row);
        const exposed = row.Publishers.find(({ TargetPort }) => TargetPort === privatePort);
        assert.equal(exposed.URL, '127.0.0.1');
        return exposed.PublishedPort;
      };
      const grafana = `http://127.0.0.1:${port('grafana', 3000)}`;
      const loki = `http://127.0.0.1:${port('loki', 3100)}`;
      const tempo = `http://127.0.0.1:${port('tempo', 3200)}`;
      const otlp = `http://127.0.0.1:${port('tempo', 4318)}`;
      assert.equal(rows.find(({ Service }) => Service === 'grafana').Health, 'healthy');
      const datasources = await json(`${grafana}/api/datasources`);
      assert.deepEqual(datasources.map(({ uid }) => uid).sort(), ['loki', 'tempo']);
      const write = await fetch(`${grafana}/api/dashboards/db`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.timeout(5000),
        body: JSON.stringify({
          dashboard: { title: 'Owned denied dashboard', uid: `owned-${randomUUID()}`, panels: [] },
          overwrite: false,
        }),
      });
      assert.ok([401, 403].includes(write.status), 'anonymous Viewer must not write dashboards');

      const traceId = randomBytes(16).toString('hex');
      const timestamp = BigInt(Date.now()) * 1000000n;
      const span = {
        traceId,
        spanId: randomBytes(8).toString('hex'),
        name: 'owned-observability-probe',
        kind: 1,
        startTimeUnixNano: timestamp.toString(),
        endTimeUnixNano: (timestamp + 1000000n).toString(),
      };
      const trace = await fetch(`${otlp}/v1/traces`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.timeout(5000),
        body: JSON.stringify({
          resourceSpans: [
            {
              resource: { attributes: [{ key: 'service.name', value: { stringValue: 'nrb-owned-observe' } }] },
              scopeSpans: [{ spans: [span] }],
            },
          ],
        }),
      });
      assert.equal(trace.status, 200);
      await until(async () => {
        const data = await json(`${tempo}/api/traces/${traceId}`);
        assert.ok(JSON.stringify(data).includes('owned-observability-probe'));
      });
      const logText = `owned-observability-log-${randomUUID()}`;
      const push = await fetch(`${loki}/loki/api/v1/push`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.timeout(5000),
        body: JSON.stringify({
          streams: [{ stream: { service_name: 'nrb_owned_observe' }, values: [[timestamp.toString(), logText]] }],
        }),
      });
      assert.equal(push.status, 204);
      const query = new URLSearchParams({
        query: '{service_name="nrb_owned_observe"}',
        start: (timestamp - 60000000000n).toString(),
        end: (timestamp + 60000000000n).toString(),
      });
      await until(async () => {
        const data = await json(`${grafana}/api/datasources/proxy/uid/loki/loki/api/v1/query_range?${query}`);
        assert.ok(JSON.stringify(data).includes(logText));
      });
      const proxiedTrace = await json(`${grafana}/api/datasources/proxy/uid/tempo/api/traces/${traceId}`);
      assert.ok(JSON.stringify(proxiedTrace).includes('owned-observability-probe'));
    } finally {
      try {
        if (started) compose('down', '--volumes', '--remove-orphans');
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  },
);
