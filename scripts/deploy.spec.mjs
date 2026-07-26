// @requirements REQ-RUNTIME-DELIVERY-009
// Evidence for: REQ-RUNTIME-DELIVERY-009
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deployTargets,
  deployPresets,
  presetNames,
  describePreset,
  buildDeployPlan,
  deriveComposeEnv,
  normalizeAnswers,
  parseDeployArgs,
} from './deploy.mjs';

// Axis-neutral fixture: each target/edge derives its own compatible defaults.
// Tests that exercise the legacy wire vocabulary pass `domains`/`tls` explicitly.
const base = {
  target: 'compose',
  domain: 'acme.example',
  database: 'bundled-db',
  profiles: [],
  imageTag: 'sha-0123456789abcdef0123456789abcdef01234567',
};

// Presets choose target/database themselves, and explicit flags win over a preset,
// so the preset fixture must not pin the axes a preset is responsible for.
const { target: _ignoredTarget, database: _ignoredDatabase, ...presetBase } = base;

const titles = (plan) => plan.steps.map((step) => step.title);
const commandLine = (step) => [step.command, ...step.args].join(' ');
const stepFor = (plan, fragment) => plan.steps.find((step) => step.title.toLowerCase().includes(fragment));

test('every documented target is plannable', () => {
  assert.deepEqual(deployTargets, ['compose', 'pm2', 'helm']);
  // Each target gets axes that are legal for it: a Caddy edge for plain Compose and
  // Helm, a host proxy for PM2 and the single-server preset.
  const perTarget = {
    compose: { edge: 'caddy', tls: 'acme' },
    helm: { edge: 'caddy', tls: 'acme' },
    pm2: { edge: 'host-nginx', tls: 'certbot' },
  };
  for (const target of deployTargets) {
    const plan = buildDeployPlan({ ...base, target, ...perTarget[target] });
    assert.equal(plan.target, target);
    assert.ok(plan.steps.length > 0, `${target} must produce steps`);
  }
});

test('compose plan scaffolds, validates, pulls, and launches in order', () => {
  const plan = buildDeployPlan(base);
  assert.deepEqual(titles(plan), [
    'Scaffold environment and secrets',
    'Validate deployment configuration',
    'Render merged Compose model',
    'Pull release images',
    'Start the production stack',
    'Report running services',
  ]);
  assert.match(commandLine(stepFor(plan, 'scaffold')), /compose-production-init\.mjs --database=bundled-db/u);
  assert.match(commandLine(stepFor(plan, 'pull')), /compose-production\.mjs pull/u);
  assert.match(commandLine(stepFor(plan, 'start')), /compose-production\.mjs up -d/u);
});

test('compose plan writes the supplied domain, registry, and image tag into the env file', () => {
  const scaffold = commandLine(stepFor(buildDeployPlan({ ...base, registry: 'ghcr.io/acme-org/acme' }), 'scaffold'));
  assert.match(scaffold, /--domain=acme\.example/u, 'the domain must reach the scaffolder');
  assert.match(scaffold, /--registry=ghcr\.io\/acme-org\/acme/u);
  assert.match(scaffold, /--image-tag=sha-0123456789abcdef0123456789abcdef01234567/u);
});

test('compose plan builds locally instead of pulling when images=local', () => {
  const plan = buildDeployPlan({ ...base, images: 'local' });
  assert.ok(!titles(plan).includes('Pull release images'));
  assert.match(commandLine(stepFor(plan, 'build images')), /compose-production\.mjs build/u);
  assert.match(commandLine(stepFor(plan, 'scaffold')), /--image-source=local/u);
});

test('--source-build remains a back-compat alias for images=local', () => {
  assert.equal(parseDeployArgs(['--source-build']).images, 'local');
});

test('compose plan pulls published images by default', () => {
  const plan = buildDeployPlan(base);
  assert.match(commandLine(stepFor(plan, 'pull')), /compose-production\.mjs pull/u);
  assert.match(commandLine(stepFor(plan, 'scaffold')), /--image-source=registry/u);
});

test('compose plan threads domain style, TLS mode, and profiles into every compose call', () => {
  const plan = buildDeployPlan({
    ...base,
    domains: 'single-domain',
    tls: 'provided',
    profiles: ['notification-consumer'],
  });
  for (const step of plan.steps.filter(
    (item) => item.command.includes('node') || item.args.some((a) => a.includes('compose-production.mjs')),
  )) {
    if (!step.args.some((arg) => arg.includes('compose-production.mjs'))) continue;
    assert.ok(step.args.includes('--domains=single-domain'), `${step.title} must pass the domain style`);
    assert.ok(step.args.includes('--tls=provided'), `${step.title} must pass the TLS mode`);
    assert.ok(step.args.includes('--profile=notification-consumer'), `${step.title} must pass profiles`);
  }
});

test('pm2 plan builds, validates, migrates, then starts processes', () => {
  const plan = buildDeployPlan({ ...base, target: 'pm2', domains: 'external-proxy', tls: 'external' });
  assert.deepEqual(titles(plan), [
    'Install workspace dependencies',
    'Build applications',
    'Generate runtime secrets',
    'Validate deployment configuration',
    'Run database migrations',
    'Start or reload PM2 services',
    'Persist the PM2 process list',
    // PM2 defaults to a host proxy, so the edge is rendered as part of the plan.
    'Render host nginx configuration',
    'Test and reload nginx',
    'Obtain or renew certificates',
  ]);
  assert.match(commandLine(stepFor(plan, 'migrations')), /db:migrate/u);
  // startOrReload plus --update-env is what makes a rotated secret take effect.
  assert.match(commandLine(stepFor(plan, 'reload pm2')), /pm2 startOrReload ecosystem\.config\.cjs --update-env/u);
  assert.match(commandLine(stepFor(plan, 'persist')), /pm2 save/u);
  // Every generatable secret is generated for PM2 too, not typed by hand.
  assert.match(commandLine(stepFor(plan, 'generate runtime secrets')), /--emit-env=\.env\.pm2-secrets/u);
});

test('pm2 plan enables optional workers through explicit env flags', () => {
  const plan = buildDeployPlan({
    ...base,
    target: 'pm2',
    domains: 'external-proxy',
    tls: 'external',
    profiles: ['discord', 'notification-consumer'],
  });
  const start = stepFor(plan, 'reload pm2');
  assert.equal(start.env.PM2_ENABLE_DISCORD, 'true');
  assert.equal(start.env.PM2_ENABLE_NOTIFICATIONS, 'true');
  assert.equal(start.env.PM2_ENABLE_TELEGRAM, undefined);
});

test('helm plan validates the chart then upgrades with production values', () => {
  const plan = buildDeployPlan({ ...base, target: 'helm', namespace: 'acme', releaseName: 'acme' });
  assert.deepEqual(titles(plan), [
    'Validate deployment configuration',
    'Deploy the Helm release',
    'Report rollout status',
  ]);
  const upgrade = commandLine(stepFor(plan, 'helm release'));
  assert.match(upgrade, /helm upgrade --install acme \.helm/u);
  assert.match(upgrade, /--namespace acme --create-namespace/u);
  assert.match(upgrade, /-f \.helm\/values\.yaml -f \.helm\/values-production\.yaml/u);
  assert.match(upgrade, /--atomic --wait/u);
});

test('single-server is a preset over the compose target, not a runtime of its own', () => {
  const plan = buildDeployPlan({ ...presetBase, preset: 'single-server' });
  assert.equal(plan.target, 'compose', 'the preset resolves to a real runtime');
  assert.equal(plan.preset, 'single-server');
  assert.equal(plan.answers.edge, 'host-nginx');
  assert.equal(plan.answers.tls, 'certbot');
  assert.equal(plan.answers.domains, 'external-proxy');
  const provision = stepFor(plan, 'provision the host');
  assert.ok(provision?.sudo, 'host provisioning is privileged');
  assert.match(commandLine(stepFor(plan, 'start')), /compose-production\.mjs up -d/u);
  assert.ok(stepFor(plan, 'render host nginx')?.sudo);
});

test('--target=single-server still works as a deprecated alias', () => {
  const plan = buildDeployPlan({ ...base, target: 'single-server' });
  assert.equal(plan.target, 'compose');
  assert.equal(plan.preset, 'single-server');
  assert.ok(
    plan.notices.some((notice) => /deprecated/u.test(notice)),
    'the alias must announce itself as deprecated',
  );
});

test('the native preset deploys with no containers at all', () => {
  const plan = buildDeployPlan({ ...presetBase, preset: 'native' });
  assert.equal(plan.target, 'pm2');
  assert.equal(plan.answers.database, 'native');
  assert.equal(plan.answers.edge, 'host-nginx');
  assert.equal(plan.answers.frontendMode, 'static', 'nginx serves the built SPAs directly');
  // Data services are installed on the host, and no Compose command appears.
  assert.match(commandLine(stepFor(plan, 'install postgresql')), /native-datastores\.mjs install/u);
  assert.ok(stepFor(plan, 'install postgresql').sudo);
  assert.match(commandLine(stepFor(plan, 'create the database role')), /native-datastores\.mjs configure/u);
  assert.ok(
    !plan.steps.some((item) => item.args.some((arg) => arg.includes('compose-production.mjs'))),
    'a native deployment must not invoke the Compose wrapper',
  );
  assert.match(commandLine(stepFor(plan, 'reload pm2')), /pm2 startOrReload/u);
  // The built SPAs are published to a web root instead of served from the checkout.
  assert.ok(stepFor(plan, 'render host nginx'), 'the host edge is rendered');
});

test('explicit flags override a preset', () => {
  const plan = buildDeployPlan({ ...presetBase, preset: 'single-server', edge: 'caddy', tls: 'acme' });
  assert.equal(plan.answers.edge, 'caddy');
  assert.equal(plan.answers.tls, 'acme');
});

test('presets are self-describing and unknown ones are rejected', () => {
  assert.deepEqual(presetNames, ['single-server', 'native']);
  for (const name of presetNames) {
    const { summary, flags } = describePreset(name);
    assert.ok(summary.length > 10, `${name} needs a human summary`);
    assert.match(flags, /--target=/u, `${name} must expand to explicit flags`);
    assert.ok(deployPresets[name].target);
  }
  assert.throws(() => buildDeployPlan({ ...presetBase, preset: 'nope' }), /Unknown preset/u);
});

test('native database is rejected for container and cluster targets', () => {
  for (const target of ['compose', 'helm']) {
    assert.throws(
      () => buildDeployPlan({ ...base, target, database: 'native' }),
      /only supported with --target=pm2/u,
      target,
    );
  }
  // ...but allowed for the native runtime.
  assert.equal(buildDeployPlan({ ...base, target: 'pm2', database: 'native' }).answers.database, 'native');
});

test('pm2 with an operator-owned edge plans no nginx steps', () => {
  const plan = buildDeployPlan({ ...base, target: 'pm2', edge: 'none', tls: 'none' });
  assert.ok(!plan.steps.some((item) => item.title.toLowerCase().includes('nginx')));
});

test('host-nginx edge is available to plain compose without the preset', () => {
  const plan = buildDeployPlan({ ...base, edge: 'host-nginx', tls: 'certbot' });
  assert.equal(plan.answers.domains, 'external-proxy');
  assert.ok(!titles(plan).includes('Provision the host'), 'provisioning stays opt-in');
  assert.ok(stepFor(plan, 'render host nginx'));
  assert.match(commandLine(stepFor(plan, 'scaffold')), /--public-mode=per-app-domains/u);
});

test('edge=none leaves the whole public surface to the operator', () => {
  const plan = buildDeployPlan({ ...base, edge: 'none', tls: 'none' });
  assert.equal(plan.answers.domains, 'external-proxy');
  assert.ok(!titles(plan).some((title) => title.includes('nginx')), 'no edge steps are planned');
  assert.ok(plan.warnings.some((warning) => /127\.0\.0\.1/u.test(warning)));
});

test('validation can be skipped explicitly but is present by default', () => {
  assert.ok(titles(buildDeployPlan(base)).includes('Validate deployment configuration'));
  assert.ok(!titles(buildDeployPlan({ ...base, skipValidate: true })).includes('Validate deployment configuration'));
});

test('rejects every invalid edge x tls cell with an actionable message', () => {
  const cases = [
    [{ edge: 'caddy', tls: 'certbot' }, /Certbot runs on the host/u],
    [{ edge: 'caddy', tls: 'none' }, /must own certificates/u],
    [{ edge: 'host-nginx', tls: 'acme' }, /issued by Certbot on the host/u],
    [{ edge: 'host-nginx', tls: 'none' }, /Host nginx serves HTTPS/u],
    [{ edge: 'none', tls: 'acme' }, /nothing in this repo terminates TLS/u],
    [{ edge: 'none', tls: 'provided' }, /nothing in this repo terminates TLS/u],
  ];
  for (const [axes, expected] of cases) {
    assert.throws(() => buildDeployPlan({ ...base, ...axes }), expected, JSON.stringify(axes));
  }
});

test('single-domain plus bot profiles is rejected only for the Caddy edge', () => {
  assert.throws(
    () => buildDeployPlan({ ...base, edge: 'caddy', publicMode: 'single-domain', profiles: ['telegram'] }),
    /per-app-domains/u,
  );
  // The host-nginx renderer does support bot routes on one hostname.
  const plan = buildDeployPlan({
    ...base,
    edge: 'host-nginx',
    tls: 'certbot',
    publicMode: 'single-domain',
    profiles: ['telegram'],
  });
  assert.match(commandLine(stepFor(plan, 'scaffold')), /--public-mode=single-domain/u);
});

test('rejects unsupported axis values', () => {
  assert.throws(() => buildDeployPlan({ ...base, target: 'nope' }), /Unsupported target/u);
  assert.throws(() => buildDeployPlan({ ...base, database: 'sqlite' }), /bundled-db|external-db/u);
  assert.throws(() => buildDeployPlan({ ...base, edge: 'traefik' }), /Edge mode/u);
  assert.throws(() => buildDeployPlan({ ...base, images: 'ftp' }), /Image source/u);
});

test('normalizeAnswers derives compatible axis defaults per target', () => {
  const compose = normalizeAnswers({ target: 'compose', domain: 'acme.example' });
  assert.equal(compose.database, 'bundled-db');
  assert.equal(compose.publicMode, 'per-app-domains');
  assert.equal(compose.edge, 'caddy');
  assert.equal(compose.tls, 'acme');
  assert.equal(compose.images, 'registry');
  assert.equal(compose.domains, 'per-app-domains');

  const pm2 = normalizeAnswers({ target: 'pm2', domain: 'acme.example' });
  assert.equal(pm2.edge, 'host-nginx', 'pm2 is fronted by a host proxy');
  assert.equal(pm2.tls, 'certbot');
  assert.equal(pm2.domains, 'external-proxy', 'pm2 must not run a Compose edge');
  assert.equal(pm2.frontendMode, 'static', 'nginx serves the built SPAs for a native runtime');
});

test('legacy wire vocabulary keeps working', () => {
  // Old runbooks pass the Compose env values directly.
  const legacy = normalizeAnswers({ target: 'compose', domains: 'external-proxy', tls: 'external' });
  assert.equal(legacy.edge, 'host-nginx');
  assert.equal(legacy.tls, 'certbot');
  assert.equal(legacy.domains, 'external-proxy');
  const automatic = normalizeAnswers({ target: 'compose', domains: 'single-domain', tls: 'automatic' });
  assert.equal(automatic.edge, 'caddy');
  assert.equal(automatic.tls, 'acme');
  assert.equal(automatic.domains, 'single-domain');
});

test('deriveComposeEnv maps axes onto the two Compose env values', () => {
  assert.deepEqual(deriveComposeEnv({ edge: 'caddy', publicMode: 'single-domain', tls: 'acme' }), {
    domainMode: 'single-domain',
    tlsMode: 'automatic',
    publicMode: undefined,
  });
  assert.deepEqual(deriveComposeEnv({ edge: 'caddy', publicMode: 'per-app-domains', tls: 'provided' }), {
    domainMode: 'per-app-domains',
    tlsMode: 'provided',
    publicMode: undefined,
  });
  assert.deepEqual(deriveComposeEnv({ edge: 'host-nginx', publicMode: 'single-domain', tls: 'certbot' }), {
    domainMode: 'external-proxy',
    tlsMode: 'external',
    publicMode: 'single-domain',
  });
});

test('parseDeployArgs maps CLI flags onto answers', () => {
  const parsed = parseDeployArgs([
    '--target=pm2',
    '--domain=acme.example',
    '--database=external-db',
    '--profile=discord,telegram',
    '--yes',
    '--dry-run',
  ]);
  assert.equal(parsed.target, 'pm2');
  assert.equal(parsed.domain, 'acme.example');
  assert.equal(parsed.database, 'external-db');
  assert.deepEqual(parsed.profiles, ['discord', 'telegram']);
  assert.equal(parsed.yes, true);
  assert.equal(parsed.dryRun, true);
});

test('parseDeployArgs rejects unknown flags instead of ignoring them', () => {
  assert.throws(() => parseDeployArgs(['--taget=pm2']), /Unknown/u);
});
