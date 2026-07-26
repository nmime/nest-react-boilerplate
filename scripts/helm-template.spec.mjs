// @requirements REQ-RUNTIME-DELIVERY-009
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const chart = resolve(root, '.helm');
const prodValues = resolve(chart, 'values-production.yaml');

function helmAvailable() {
  try {
    execFileSync('helm', ['version', '--short'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

const HELM = helmAvailable();

/** Render the chart to multi-doc YAML text. */
function render(releaseName, extraArgs = []) {
  return execFileSync('helm', ['template', releaseName, chart, '--namespace', 'nrb', '-f', prodValues, ...extraArgs], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
}

/** Render with default values (+ synthetic in-chart secret), like validate-helm.sh. */
function renderDefault(releaseName, extraArgs = []) {
  return execFileSync(
    'helm',
    [
      'template',
      releaseName,
      chart,
      '--namespace',
      'nrb',
      '--set',
      'secrets.create=true',
      '--set-string',
      'secrets.sessionSecret=ci-only-session-secret-minimum-32-characters',
      '--set-string',
      'secrets.betterAuthSecret=ci-only-better-auth-secret-minimum-32-characters',
      '--set-string',
      'secrets.databaseUrl=postgres://ci:ci@postgresql:5432/ci',
      ...extraArgs,
    ],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
}

/** Extract the YAML doc (between `---` separators) whose kind + name match. */
function docFor(rendered, kind, nameFragment) {
  const docs = rendered.split(/^---$/m);
  return docs.find((d) => d.includes(`kind: ${kind}`) && d.includes(nameFragment)) ?? '';
}

test('PodDisruptionBudget honors minAvailable from production values', { skip: !HELM }, () => {
  const out = render('nrbtest');
  const pdb = docFor(out, 'PodDisruptionBudget', 'nrbtest-auth-app-api');
  assert.ok(pdb, 'expected a PodDisruptionBudget for auth-app-api in production render');
  assert.match(pdb, /minAvailable:\s*1/, 'production PDB must emit the configured minAvailable');
  assert.doesNotMatch(pdb, /maxUnavailable/, 'production PDB must not silently fall back to maxUnavailable');
});

test('PodDisruptionBudget falls back to maxUnavailable when minAvailable is unset', { skip: !HELM }, () => {
  const out = render('nrbtest', [
    '--set',
    'podDisruptionBudget.minAvailable=null',
    '--set',
    'podDisruptionBudget.maxUnavailable=2',
  ]);
  const pdb = docFor(out, 'PodDisruptionBudget', 'nrbtest-auth-app-api');
  assert.ok(pdb, 'expected a PodDisruptionBudget for auth-app-api');
  assert.match(pdb, /maxUnavailable:\s*2/, 'PDB must use maxUnavailable when minAvailable is not set');
  assert.doesNotMatch(pdb, /minAvailable/, 'PDB must not emit both disruption fields');
});

test('fullname is release-name aware (avoids cross-release object collisions)', { skip: !HELM }, () => {
  const out = render('acme');
  assert.match(out, /name:\s*acme-auth-app-api/, 'resources must be prefixed with the release name');
});

test('fullname stays stable for the canonical release name (backward compatible)', { skip: !HELM }, () => {
  const out = render('nest-react-boilerplate');
  assert.match(
    out,
    /name:\s*nest-react-boilerplate-auth-app-api/,
    'canonical release name must not change existing object names',
  );
});

test('production NetworkPolicy allows external HTTPS egress via ipBlock', { skip: !HELM }, () => {
  const out = render('nrbtest');
  const netpols = out
    .split(/^---$/m)
    .filter((d) => d.includes('kind: NetworkPolicy'))
    .join('\n');
  assert.match(netpols, /ipBlock:/, 'NetworkPolicy must include an ipBlock egress rule');
  assert.match(netpols, /cidr:\s*0\.0\.0\.0\/0/, 'external egress must allow the public internet CIDR');
  assert.match(netpols, /except:/, 'external egress must exclude private ranges via except');
});

test('Helm SRE dashboard uses the emitted OTel HTTP metric name', () => {
  const helmDash = readFileSync(resolve(chart, 'dashboards/nest-react-boilerplate.json'), 'utf8');
  assert.match(
    helmDash,
    /http_server_duration_seconds_count/,
    'dashboard must query the metric the app actually emits',
  );
  assert.doesNotMatch(
    helmDash,
    /http_server_request_duration_seconds/,
    'dashboard must not use the stable-semconv name that is not emitted (no OTEL_SEMCONV_STABILITY_OPT_IN is set)',
  );
});

test('Helm and Docker dashboards agree on the HTTP metric base name', () => {
  const helmDash = readFileSync(resolve(chart, 'dashboards/nest-react-boilerplate.json'), 'utf8');
  const dockerDash = readFileSync(resolve(root, 'docker/grafana/dashboards/nest-react-boilerplate.json'), 'utf8');
  const base = 'http_server_duration_seconds';
  assert.ok(helmDash.includes(base), 'helm dashboard must use the shared metric base');
  assert.ok(dockerDash.includes(base), 'docker dashboard must use the shared metric base');
});

test('frontend runtime flags are injected as env on SPA deployments only', { skip: !HELM }, () => {
  const out = render('nrbtest', ['--set-string', 'frontendRuntimeConfig.TELEGRAM_AUTH_ENABLED=true']);
  const userApp = docFor(out, 'Deployment', 'nrbtest-user-app');
  assert.ok(userApp, 'expected a user-app Deployment');
  assert.match(userApp, /name: TELEGRAM_AUTH_ENABLED/, 'SPA deployments must receive runtime feature flags');
  // Backends read flags from the ConfigMap/Secret, not this browser-safe surface.
  const authApi = docFor(out, 'Deployment', 'nrbtest-auth-app-api');
  assert.doesNotMatch(authApi, /name: TELEGRAM_AUTH_ENABLED/, 'backend deployments must not get frontend runtime env');
});

test('frontend runtime flags are absent when unconfigured', { skip: !HELM }, () => {
  const out = render('nrbtest');
  assert.doesNotMatch(out, /name: TELEGRAM_AUTH_ENABLED/, 'no flags must render when frontendRuntimeConfig is empty');
});

test('backup CronJob fails closed when enabled without a durable destination', { skip: !HELM }, () => {
  // Default values ship no destination; production overrides with an object store.
  assert.throws(
    () => renderDefault('nrbtest', ['--set', 'backups.enabled=true']),
    /durable destination/,
    'enabling backups with only an emptyDir must be rejected at render time',
  );
});

test('backup CronJob renders when a durable destination is configured', { skip: !HELM }, () => {
  const out = renderDefault('nrbtest', [
    '--set',
    'backups.enabled=true',
    '--set',
    'backups.destination.pvc.enabled=true',
    '--set-string',
    'backups.destination.pvc.claimName=nrb-backups',
  ]);
  assert.match(out, /kind: CronJob/, 'a configured backup destination must render the CronJob');
  assert.match(out, /postgres-backup/);
});

test("Helm dashboard 'Available replicas' regex matches real deployment names", () => {
  const helmDash = readFileSync(resolve(chart, 'dashboards/nest-react-boilerplate.json'), 'utf8');
  assert.match(helmDash, /auth-app-api/, 'regex must match the real kebab-case component name');
  assert.doesNotMatch(
    helmDash,
    /\(auth-api\|user-api\|admin-api/,
    'stale short names never match nest-react-boilerplate-auth-app-api etc.',
  );
});
