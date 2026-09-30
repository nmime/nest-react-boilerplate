#!/usr/bin/env node
// @requirements REQ-RUNTIME-OBSERVABILITY-005
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';
import { observabilityImages } from './delivery-inventory.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const scratch = mkdtempSync(join(tmpdir(), 'nrb-observability-'));
const project = `nrbobservability${process.pid}${Date.now()}`;
const composeFile = join(scratch, 'compose.yml');
const reportFile = resolve(root, process.env.NRB_OBSERVABILITY_REPORT ?? 'test-results/observability-stack.json');
const password = randomBytes(32).toString('hex');
const passwordFile = join(scratch, 'grafana-password');
writeFileSync(passwordFile, `${password}\n`, { mode: 0o444 });
const report = { status: 'running', project, startedAt: new Date().toISOString(), images: {}, checks: [] };

function docker(args) {
  const result = spawnSync('docker', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`docker ${args[0]} failed (${result.status}): ${result.stderr}`);
  return result.stdout.trim();
}
const compose = (args) => docker(['compose', '-p', project, '-f', composeFile, ...args]);
const bind = (source, target) => `type=bind,src=${join(root, source)},dst=${target},readonly`;
const pause = () => new Promise((done) => setTimeout(done, 1000));

async function eventually(description, check, timeout = 120_000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      report.checks.push({ description, status: 'passed' });
      return value;
    } catch (error) {
      lastError = error;
      await pause();
    }
  }
  throw new Error(`${description}: ${lastError?.message ?? 'timed out'}`);
}

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(5000) });
  assert.equal(response.ok, true, `${new URL(url).pathname}: HTTP ${response.status}`);
  return response;
}

try {
  docker(['compose', 'version']);
  for (const [service, image] of Object.entries(observabilityImages)) {
    let inspection;
    try {
      inspection = JSON.parse(docker(['image', 'inspect', image]))[0];
    } catch {
      docker(['pull', image]);
      inspection = JSON.parse(docker(['image', 'inspect', image]))[0];
    }
    report.images[service] = { reference: image, id: inspection.Id, architecture: inspection.Architecture };
  }
  docker([
    'run',
    '--rm',
    '-e',
    'NODE_ENV=production',
    '--mount',
    bind('docker/otel-collector-config.yaml', '/config.yaml'),
    observabilityImages['otel-collector'],
    'validate',
    '--config=/config.yaml',
  ]);
  docker([
    'run',
    '--rm',
    '--entrypoint',
    '/bin/promtool',
    '--mount',
    bind('docker/prometheus', '/etc/prometheus'),
    observabilityImages.prometheus,
    'check',
    'config',
    '/etc/prometheus/prometheus.yml',
  ]);
  docker([
    'run',
    '--rm',
    '--entrypoint',
    '/bin/amtool',
    '--mount',
    bind('docker/alertmanager/alertmanager.yml', '/config.yml'),
    observabilityImages.alertmanager,
    'check-config',
    '/config.yml',
  ]);
  report.checks.push({
    description: 'collector, Prometheus and Alertmanager native configuration validation',
    status: 'passed',
  });

  const source = parse(readFileSync(join(root, 'docker/docker-compose.prod.yml'), 'utf8'));
  const services = {};
  const volumes = {};
  for (const name of ['otel-collector', 'prometheus', 'alertmanager', 'grafana']) {
    const service = structuredClone(source.services[name]);
    assert.equal(service.image, observabilityImages[name]);
    service.ports = (
      name === 'otel-collector'
        ? [4318, 9464, 13133]
        : [name === 'grafana' ? 3000 : name === 'prometheus' ? 9090 : 9093]
    ).map((target) => ({ target, host_ip: '127.0.0.1', published: '0' }));
    service.restart = 'no';
    delete service.logging;
    service.volumes = service.volumes.map((mount) => {
      if (mount.startsWith('./'))
        return `${join(root, 'docker', mount.split(':')[0].slice(2))}${mount.slice(mount.indexOf(':'))}`;
      volumes[mount.split(':')[0]] = {};
      return mount;
    });
    services[name] = service;
  }
  services.grafana.environment.GF_SECURITY_ADMIN_USER = 'audit';
  services.coroot = {
    image: observabilityImages.coroot,
    environment: { COROOT_PROMETHEUS_URL: 'http://prometheus:9090' },
    networks: ['app'],
    ports: [{ target: 8080, host_ip: '127.0.0.1', published: '0' }],
    volumes: ['coroot-data:/data'],
  };
  volumes['coroot-data'] = {};
  writeFileSync(
    composeFile,
    stringify({
      services,
      networks: { app: {} },
      volumes,
      secrets: { grafana_admin_password: { file: passwordFile } },
    }),
  );
  compose(['up', '-d', '--no-build', '--pull', 'never']);
  const endpoint = (service, port) => `http://${compose(['port', service, String(port)])}`;
  const collector = endpoint('otel-collector', 4318);
  const prometheus = endpoint('prometheus', 9090);
  const alertmanager = endpoint('alertmanager', 9093);
  const grafana = endpoint('grafana', 3000);
  const auth = { Authorization: `Basic ${Buffer.from(`audit:${password}`).toString('base64')}` };
  await eventually('collector HTTP readiness', () => request(`${endpoint('otel-collector', 13133)}/`));
  await eventually('Prometheus readiness', () => request(`${prometheus}/-/ready`));
  await eventually('Alertmanager readiness', () => request(`${alertmanager}/-/ready`));
  await eventually('Grafana database health', async () => {
    const health = await (await request(`${grafana}/api/health`)).json();
    assert.equal(health.database, 'ok');
    report.grafanaVersion = health.version;
  });
  await eventually('Coroot HTTP startup (no Kubernetes discovery assertion)', () =>
    request(`${endpoint('coroot', 8080)}/`),
  );
  await eventually('native Compose healthchecks', () => {
    for (const service of ['prometheus', 'alertmanager', 'grafana']) {
      const id = compose(['ps', '-q', service]);
      assert.equal(JSON.parse(docker(['inspect', id]))[0].State.Health.Status, 'healthy', service);
    }
  });

  const timeUnixNano = String(BigInt(Date.now()) * 1_000_000n);
  const metric = {
    resourceMetrics: [
      {
        resource: { attributes: [{ key: 'service.name', value: { stringValue: 'nrb-observability-smoke' } }] },
        scopeMetrics: [
          {
            scope: { name: 'nrb-smoke' },
            metrics: [{ name: 'nrb_audit_probe', gauge: { dataPoints: [{ timeUnixNano, asDouble: 7 }] } }],
          },
        ],
      },
    ],
  };
  const accepted = await (
    await request(`${collector}/v1/metrics`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(metric),
    })
  ).json();
  assert.equal(accepted.partialSuccess?.rejectedDataPoints ?? 0, 0);
  const query = 'nrb_audit_probe{service_name="nrb-observability-smoke",deployment_environment="production"}';
  const assertMetric = (result) => {
    assert.equal(result.status, 'success');
    assert.equal(result.data.result.length, 1);
    assert.equal(Number(result.data.result[0].value[1]), 7);
  };
  await eventually('OTLP metric scraped by Prometheus with resource attributes', async () =>
    assertMetric(await (await request(`${prometheus}/api/v1/query?query=${encodeURIComponent(query)}`)).json()),
  );
  await eventually('all four monitoring scrape targets are up', async () => {
    const result = await (
      await request(
        `${prometheus}/api/v1/query?query=${encodeURIComponent('up{job=~"otel-collector|prometheus|alertmanager|grafana"}')}`,
      )
    ).json();
    assert.equal(result.data.result.length, 4);
    assert.ok(result.data.result.every((row) => Number(row.value[1]) === 1));
  });
  await eventually('Grafana provisions exactly the two bundled datasources', async () => {
    const datasources = await (await request(`${grafana}/api/datasources`, { headers: auth })).json();
    assert.deepEqual(datasources.map((item) => item.uid).sort(), ['alertmanager', 'prometheus']);
  });
  const defaultPassword = await fetch(`${grafana}/api/datasources`, {
    headers: { Authorization: `Basic ${Buffer.from('audit:admin').toString('base64')}` },
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(defaultPassword.status, 401);
  report.checks.push({
    description: 'Grafana uses the mounted secret and rejects the default password',
    status: 'passed',
  });
  await eventually('Grafana provisions the production dashboard', async () => {
    const dashboard = await (await request(`${grafana}/api/dashboards/uid/nrb-production`, { headers: auth })).json();
    assert.equal(dashboard.meta.provisioned, true);
    assert.ok(dashboard.dashboard.panels.length > 0);
  });
  await eventually('OTLP metric query through Grafana Prometheus datasource', async () =>
    assertMetric(
      await (
        await request(
          `${grafana}/api/datasources/proxy/uid/prometheus/api/v1/query?query=${encodeURIComponent(query)}`,
          { headers: auth },
        )
      ).json(),
    ),
  );
  await request(`${alertmanager}/api/v2/alerts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify([
      {
        labels: { alertname: 'NrbAuditProbe', severity: 'critical', service: 'nrb-observability-smoke' },
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 300_000).toISOString(),
      },
    ]),
  });
  await eventually('Alertmanager accepts and routes an alert to an explicitly empty receiver', async () => {
    const alerts = await (await request(`${alertmanager}/api/v2/alerts`)).json();
    const alert = alerts.find((row) => row.labels.alertname === 'NrbAuditProbe');
    assert.ok(alert);
    assert.deepEqual(
      alert.receivers.map((receiver) => receiver.name),
      ['critical-alerts'],
    );
  });
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error.message;
  if (readFileSyncSafe(composeFile)) {
    try {
      writeFileSync(join(scratch, 'failure.log'), compose(['logs', '--no-color']));
    } catch {
      /* preserve primary error */
    }
  }
  process.exitCode = 1;
} finally {
  if (readFileSyncSafe(composeFile)) {
    try {
      compose(['down', '--volumes', '--remove-orphans']);
      report.cleanup = 'passed';
    } catch (error) {
      report.cleanup = 'failed';
      report.cleanupError = error.message;
      process.exitCode = 1;
    }
  }
  report.finishedAt = new Date().toISOString();
  mkdirSync(dirname(reportFile), { recursive: true });
  writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  if (report.status === 'passed' && report.cleanup !== 'failed') rmSync(scratch, { recursive: true, force: true });
  console.log(
    JSON.stringify({
      status: report.status,
      checks: report.checks.length,
      report: reportFile,
      ...(report.error ? { error: report.error, diagnostics: scratch } : {}),
    }),
  );
}

function readFileSyncSafe(path) {
  try {
    return readFileSync(path).length > 0;
  } catch {
    return false;
  }
}
