// @requirements REQ-RUNTIME-DELIVERY-009
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import {
  assertRecentBackup,
  buildLiveValidationPlan,
  parseLiveValidationOptions,
  selectPreviousRevision,
} from './validate-kubernetes-live.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const chart = resolve(root, '.helm');
/**
 * These assertions are about chart behaviour, so they must not inherit the ambient
 * `.helm/values-selection.yaml` — `nrb setup` narrows that file to whatever the caller selected,
 * and the helm-validation CI matrix narrows it to a single app before running this spec, which
 * silently removed the Deployments the assertions are about. Derive a full reference selection
 * from the chart's own app catalog instead, so the spec exercises the chart rather than whatever
 * selection happens to be materialised.
 */
function writeReferenceSelection() {
  const values = readFileSync(resolve(chart, 'values.yaml'), 'utf8');
  const appsBlock = /^apps:\n((?:[ \t].*\n|\n)*)/mu.exec(values);
  assert.ok(appsBlock, '.helm/values.yaml must declare an apps catalog for the reference selection');
  const appKeys = [...appsBlock[1].matchAll(/^ {2}([a-zA-Z][a-zA-Z0-9]*):$/gmu)].map((match) => match[1]);
  assert.ok(appKeys.length > 0, 'reference selection needs at least one app key from .helm/values.yaml');

  // The chart also requires deployment.selectedApps, keyed by appId rather than by values key.
  const appIds = [...appsBlock[1].matchAll(/^ {4}appId: (\S+)$/gmu)].map((match) => match[1]).sort();
  assert.equal(appIds.length, appKeys.length, 'every app in .helm/values.yaml must declare an appId');

  const body = [
    '# Written by scripts/helm-template.spec.mjs — a full reference selection, never the ambient one.',
    'database:',
    '  engine: postgres',
    'migrations:',
    '  enabled: true',
    'deployment:',
    '  provider: postgres',
    '  selectedApps:',
    ...appIds.map((appId) => `    - ${appId}`),
    'selection:',
    '  ciMode: product',
    '  frontendApiMode: same-origin',
    '  mobileTargets: [web]',
    '  deploymentTargets: [docker]',
    '  publicTopology: single-domain',
    '  kubernetesDelivery: direct',
    '  infrastructure:',
    '    redis: bundled',
    '    nats: bundled',
    '    s3: bundled',
    'apps:',
    ...appKeys.flatMap((key) => [`  ${key}:`, '    enabled: true']),
    '',
  ].join('\n');

  const path = join(mkdtempSync(join(tmpdir(), 'nrb-helm-reference-selection-')), 'values-selection.yaml');
  writeFileSync(path, body);
  return path;
}

const selectionValues = writeReferenceSelection();
const prodValues = resolve(chart, 'values-production.yaml');
const otelEnabledArgs = [
  '--set',
  'monitoring.enabled=true',
  '--set',
  'monitoring.otel.enabled=true',
  '--set',
  'monitoring.otelCollector.enabled=true',
];

function helmAvailable() {
  try {
    execFileSync('helm', ['version', '--short'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

const HELM = helmAvailable();

test('live Kubernetes preflight plans only read or use server-side dry-run operations', () => {
  const options = parseLiveValidationOptions([
    '--context=production-preflight',
    '--namespace=nrb',
    '--release=nrb',
    '--backup-cronjob=platform-postgres-backup',
  ]);
  const plan = buildLiveValidationPlan(options, '/tmp/candidate.yaml', 7);
  const byId = Object.fromEntries(plan.map((step) => [step.id, step]));

  assert.ok(byId['helm-server-dry-run'].args.includes('--dry-run=server'));
  assert.ok(byId['helm-server-dry-run'].args.includes('--hide-secret'));
  assert.ok(byId['admission-dry-run'].args.includes('--dry-run=server'));
  assert.ok(byId['admission-dry-run'].args.includes('--validate=strict'));
  assert.ok(byId['admission-dry-run'].args.includes('--force-conflicts'));
  assert.ok(byId['rollback-server-dry-run'].args.includes('--dry-run=server'));
  assert.ok(byId['rollback-server-dry-run'].args.includes('--no-hooks'));
  assert.ok(byId['backup-admission-dry-run'].args.includes('--dry-run=server'));
  assert.equal(byId['backup-freshness'].args.includes('secret'), false);
  assert.throws(() => parseLiveValidationOptions(['--plan']), /--context is required/);
});

test('live Kubernetes preflight requires rollback history and a recent successful backup', () => {
  assert.equal(
    selectPreviousRevision([
      { revision: 5, status: 'superseded' },
      { revision: 6, status: 'failed' },
      { revision: 7, status: 'deployed' },
    ]),
    5,
  );
  assert.throws(() => selectPreviousRevision([{ revision: 1, status: 'deployed' }]), /at least two Helm revisions/);

  const now = Date.parse('2026-07-29T12:00:00Z');
  assert.equal(
    assertRecentBackup({ spec: { suspend: false }, status: { lastSuccessfulTime: '2026-07-29T11:30:00Z' } }, 60, now),
    30,
  );
  assert.throws(
    () =>
      assertRecentBackup({ spec: { suspend: false }, status: { lastSuccessfulTime: '2026-07-29T10:00:00Z' } }, 60, now),
    /maximum is 60/,
  );
  assert.throws(() => assertRecentBackup({ spec: { suspend: true }, status: {} }, 60, now), /suspended/);
});

/** Render the chart to multi-doc YAML text. */
function render(releaseName, extraArgs = []) {
  return execFileSync(
    'helm',
    ['template', releaseName, chart, '--namespace', 'nrb', '-f', prodValues, '-f', selectionValues, ...extraArgs],
    {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    },
  );
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
      '-f',
      selectionValues,
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

test('production NetworkPolicy permits the selected in-cluster OTEL paths', { skip: !HELM }, () => {
  const out = render('nrbtest', otelEnabledArgs);
  const defaultPolicy = docFor(out, 'NetworkPolicy', 'nrbtest-default-deny');
  const collectorPolicy = docFor(out, 'NetworkPolicy', 'nrbtest-otel-collector');

  assert.match(defaultPolicy, /app\.kubernetes\.io\/component: otel-collector[\s\S]*port: 4318/);
  assert.match(
    defaultPolicy,
    /matchExpressions:[\s\S]*key: app\.kubernetes\.io\/component[\s\S]*operator: NotIn[\s\S]*- otel-collector/u,
    'the broad application policy must not select the collector because NetworkPolicy egress is additive',
  );
  assert.match(collectorPolicy, /port: 4317[\s\S]*port: 4318/, 'collector must accept OTLP gRPC and HTTP');
  assert.match(
    collectorPolicy,
    /port: 53[\s\S]*protocol: UDP[\s\S]*port: 53[\s\S]*protocol: TCP/u,
    'collector must resolve the configured exporter hostname through cluster DNS',
  );
  assert.doesNotMatch(collectorPolicy, /ipBlock:/u, 'collector egress must contain only its exporter allowlist');
  assert.match(
    collectorPolicy,
    /kubernetes\.io\/metadata\.name: monitoring[\s\S]*port: 9464/,
    'the selected Prometheus namespace must be able to scrape collector metrics',
  );
  assert.match(
    collectorPolicy,
    /kubernetes\.io\/metadata\.name: observability[\s\S]*port: 4317/,
    'collector egress must reach the selected Tempo namespace and port',
  );
});

test('OTEL NetworkPolicy values reject empty ports and invalid namespace selectors', { skip: !HELM }, () => {
  assert.throws(() =>
    render('nrbtest', [...otelEnabledArgs, '--set-json', 'networkPolicy.otelCollector.exporterPorts=[]']),
  );
  assert.throws(() =>
    render('nrbtest', [
      ...otelEnabledArgs,
      '--set-string',
      'networkPolicy.otelCollector.exporterNamespace=Invalid_Name',
    ]),
  );
  assert.throws(() =>
    render('nrbtest', [
      ...otelEnabledArgs,
      '--set-string',
      'networkPolicy.otelCollector.prometheusNamespace=monitoring.example',
    ]),
  );

  assert.throws(
    () =>
      render('nrbtest', [
        ...otelEnabledArgs,
        '--skip-schema-validation',
        '--set-json',
        'networkPolicy.otelCollector.exporterPorts=[]',
      ]),
    /must contain at least one TCP port/u,
  );
  assert.throws(
    () =>
      render('nrbtest', [
        ...otelEnabledArgs,
        '--skip-schema-validation',
        '--set-string',
        'networkPolicy.otelCollector.exporterNamespace=Invalid_Name',
      ]),
    /must be a valid Kubernetes namespace name/u,
  );
});

test('Coroot Secret RBAC is disabled by default and requires explicit opt-in', { skip: !HELM }, () => {
  const defaultRole = docFor(render('nrbtest'), 'ClusterRole', 'nrbtest-coroot');
  assert.ok(defaultRole, 'production Coroot must render its discovery ClusterRole');
  assert.doesNotMatch(defaultRole, /resources:\s*\["secrets"\]/, 'default discovery must not expose Secret payloads');

  const optedInRole = docFor(
    render('nrbtest', ['--set', 'coroot.rbac.readSecrets=true']),
    'ClusterRole',
    'nrbtest-coroot',
  );
  assert.match(optedInRole, /resources:\s*\["secrets"\][\s\S]*verbs:\s*\["get", "list"\]/);
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

test('demo mode is off in the chart defaults and reachable through values', { skip: !HELM }, () => {
  const off = render('nrbtest');
  assert.match(off, /AUTH_DEMO_MODE: "false"/u, 'the chart must default demo mode off, explicitly');

  const on = render('nrbtest', [
    '--set-string',
    'config.authDemoMode=true',
    '--set-string',
    'config.authDemoAllowProduction=true',
    '--set-string',
    'config.authDemoRoles=user\\,admin',
  ]);
  assert.match(on, /AUTH_DEMO_MODE: "true"/u, 'config.authDemoMode must reach the backend ConfigMap');
  assert.match(on, /AUTH_DEMO_ALLOW_PRODUCTION: "true"/u, 'the production acknowledgement must reach the ConfigMap');
  assert.match(on, /AUTH_DEMO_ROLES: "user,admin"/u, 'the demo role list must reach the ConfigMap');
});

test('frontend runtime flags are absent when unconfigured', { skip: !HELM }, () => {
  const out = render('nrbtest');
  assert.doesNotMatch(out, /name: TELEGRAM_AUTH_ENABLED/, 'no flags must render when frontendRuntimeConfig is empty');
});

test(
  'landing runtime destinations are derived from split ingress hosts without a baked-in domain',
  { skip: !HELM },
  () => {
    const out = render('nrbtest', [
      '--set-string',
      'ingress.hosts[2].host=accounts.product.test',
      '--set-string',
      'ingress.hosts[4].host=control.product.test',
    ]);
    const landingApp = docFor(out, 'Deployment', 'nrbtest-landing-app');
    const userApp = docFor(out, 'Deployment', 'nrbtest-user-app');

    assert.match(landingApp, /name: LANDING_USER_APP_URL\s+value: "https:\/\/accounts\.product\.test"/u);
    assert.match(landingApp, /name: LANDING_ADMIN_APP_URL\s+value: "https:\/\/control\.product\.test"/u);
    assert.doesNotMatch(landingApp, /https:\/\/user-app\.example\.com/u);
    assert.doesNotMatch(userApp, /LANDING_(?:USER|ADMIN)_APP_URL/u);
  },
);

test('landing runtime destinations become validated same-origin paths for a shared Helm host', { skip: !HELM }, () => {
  const hosts = [
    { host: 'product.test', paths: ['/'], service: 'landing-app' },
    { host: 'product.test', paths: ['/account'], service: 'user-app' },
    { host: 'product.test', paths: ['/control'], service: 'admin-app' },
  ];
  const out = render('nrbtest', ['--set-json', `ingress.hosts=${JSON.stringify(hosts)}`]);
  const landingApp = docFor(out, 'Deployment', 'nrbtest-landing-app');

  assert.match(landingApp, /name: LANDING_USER_APP_URL\s+value: "\/account"/u);
  assert.match(landingApp, /name: LANDING_ADMIN_APP_URL\s+value: "\/control"/u);
  assert.throws(
    () =>
      render('nrbtest', [
        '--set-json',
        `ingress.hosts=${JSON.stringify([
          hosts[0],
          { host: 'product.test', paths: ['/'], service: 'user-app' },
          hosts[2],
        ])}`,
      ]),
    /must use a non-root ingress path/u,
  );
});

test('one route table serves both edges, so a new namespace is a single row', { skip: !HELM }, () => {
  // The route table used to be transcribed into the chart and into docker/nginx-fullstack.conf,
  // so a product adding an API namespace edited both and the two edges could route differently.
  const routes = JSON.parse(readFileSync(resolve(chart, 'frontend-routes.json'), 'utf8'));
  const composeConf = readFileSync(resolve(root, 'docker/nginx-fullstack.conf'), 'utf8');
  const nginxConfigMap = docFor(render('nrbtest'), 'ConfigMap', 'nrbtest-frontend-nginx');
  assert.ok(nginxConfigMap, 'expected a frontend-nginx ConfigMap in the production render');

  for (const route of routes.spaRoutes) {
    assert.ok(nginxConfigMap.includes(`location = ${route.path} {`), `chart is missing SPA route ${route.path}`);
    assert.ok(composeConf.includes(`location = ${route.path} {`), `Compose edge is missing SPA route ${route.path}`);
  }
  for (const location of routes.apiLocations) {
    assert.ok(nginxConfigMap.includes(`location ^~ ${location.prefix} {`), `chart is missing ${location.prefix}`);
    assert.ok(composeConf.includes(`location ^~ ${location.prefix} {`), `Compose is missing ${location.prefix}`);
  }

  // A registered namespace reaches the chart without touching a template.
  const productRoutes = {
    spaRoutes: [{ path: '/marketplace' }],
    apiLocations: [{ prefix: '/marketplace/', app: 'user-app-api', spaFallback: true }],
  };
  const overridden = render('nrbtest', ['--set-json', `frontendNginx.routes=${JSON.stringify(productRoutes)}`]);
  const overriddenConfigMap = docFor(overridden, 'ConfigMap', 'nrbtest-frontend-nginx');
  assert.match(overriddenConfigMap, /location = \/marketplace \{/u);
  assert.match(overriddenConfigMap, /location \^~ \/marketplace\/ \{[\s\S]*?nrbtest-user-app-api:80/u);
});

test('a generated host table gets TLS for every enabled host without restating them', { skip: !HELM }, () => {
  // `nrb setup` regenerates ingress.hosts for the product's own domain. A TLS list keyed to the
  // chart's example.com hosts would silently intersect to nothing and ship a certificate-free
  // Ingress, so the chart derives the certificate from the hosts it is actually serving.
  const hosts = [
    { host: 'dehqonhub.uz', paths: ['/'], service: 'site-app' },
    { host: 'user-app.dehqonhub.uz', paths: ['/'], service: 'user-app' },
    { host: 'telegram-bot-api.dehqonhub.uz', paths: ['/'], service: 'telegram-bot-api', enabled: false },
  ];
  const out = render('nrbtest', [
    '--set-json',
    `ingress.hosts=${JSON.stringify(hosts)}`,
    '--set-json',
    'ingress.tls=[]',
  ]);
  const ingress = docFor(out, 'Ingress', 'nrbtest');

  assert.match(ingress, /secretName: nest-react-boilerplate-tls/u);
  assert.match(ingress, /- "dehqonhub\.uz"/u);
  assert.match(ingress, /- "user-app\.dehqonhub\.uz"/u);
  assert.doesNotMatch(ingress, /telegram-bot-api\.dehqonhub\.uz/u);
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
