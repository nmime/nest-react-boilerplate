#!/usr/bin/env node
/**
 * deploy — one entry point that takes a deployment from a clean checkout to a
 * running system, for every supported runtime.
 *
 *   pnpm deploy                       # interactive wizard (asks target/domain/DB/TLS)
 *   pnpm deploy --target=compose --domain=acme.example --yes
 *   pnpm deploy --target=pm2 --domain=acme.example --yes
 *   pnpm deploy --target=helm --release=acme --namespace=acme --yes
 *   pnpm deploy --target=single-server --yes
 *   pnpm deploy --dry-run             # print the plan without executing anything
 *
 * Design: `buildDeployPlan()` is pure — it turns answers into an ordered list of
 * steps. Execution is a separate pass, so every topology is unit-tested without
 * touching Docker, PM2, Helm, or a host. Topologies the Compose wrapper would
 * refuse are rejected here too, before anything runs.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildNativeBuildPlan, buildNativeStartPlan, derivePm2Flags } from './native-release.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

// What actually runs your code. Edge/TLS/database/images are separate axes, so a
// "single-server VM" is not a runtime — it is a preset over these targets.
export const deployTargets = ['compose', 'pm2', 'helm'];
// `native` = PostgreSQL installed on this host (no container). Only meaningful for
// a native runtime; buildDeployPlan rejects it for container/cluster targets.
const databaseModes = ['bundled-db', 'external-db', 'native'];
/** User-facing hostname layout. `external-proxy` is accepted as a legacy wire value. */
const publicModes = ['single-domain', 'per-app-domains'];
/** Who terminates public traffic. */
export const edgeModes = ['caddy', 'host-nginx', 'none'];
/** Who issues/holds the certificates. */
export const tlsModes = ['acme', 'certbot', 'provided', 'none'];
/** Where runtime images come from. */
export const imageSources = ['registry', 'local'];
const edgeProfiles = ['discord', 'telegram'];
const supportedProfiles = ['discord', 'telegram', 'notification-consumer', 'notification-scheduler'];

/**
 * Legacy wire vocabulary accepted on input so existing runbooks and
 * `.env.production` files keep working. `external` is edge-dependent: with a host
 * proxy it means Certbot on the host, otherwise the operator owns certificates.
 */
const legacyTlsAliases = { automatic: 'acme', provided: 'provided' };

const TARGET_SUMMARY = {
  compose: 'Docker Compose containers on a single host',
  pm2: 'Native Node processes on this host (no containers)',
  helm: 'Kubernetes via the in-repo Helm chart',
};

/**
 * Named bundles of axis values. A preset is never a runtime of its own — it just
 * pre-selects axes. Explicit flags always override it.
 */
export const deployPresets = {
  'single-server': {
    target: 'compose',
    edge: 'host-nginx',
    tls: 'certbot',
    provisionHost: true,
    summary: 'Turnkey VM: Compose under systemd behind host nginx + Certbot',
  },
  native: {
    target: 'pm2',
    edge: 'host-nginx',
    tls: 'certbot',
    database: 'native',
    provisionHost: true,
    summary: 'Fully native: PostgreSQL/Redis + Node processes on this host, no Docker',
  },
};

export const presetNames = Object.keys(deployPresets);

/** Render a preset as the equivalent explicit flags, for --help and the wizard. */
export function describePreset(name) {
  const preset = deployPresets[name];
  if (!preset) throw new Error(`Unknown preset "${name}". Available: ${presetNames.join(', ')}.`);
  const { summary, ...axes } = preset;
  const flags = Object.entries(axes)
    .map(([key, value]) =>
      value === true ? `--${key.replace(/[A-Z]/gu, (c) => `-${c.toLowerCase()}`)}` : `--${key}=${value}`,
    )
    .join(' ');
  return { summary, flags };
}

// PM2 is always fronted by an operator-owned proxy; Compose can own its own edge.
const hostProxyTargets = new Set(['pm2']);

/**
 * Resolve the orthogonal axes, filling only what the caller left unset. The
 * returned `domains`/`tls` stay in the WIRE vocabulary the Compose wrapper reads;
 * `edge`, `publicMode`, and `images` are the user-facing axes.
 */
export function normalizeAnswers(answers = {}) {
  const target = answers.target ?? 'compose';
  const requestedDomains = answers.domains;
  // A Compose-owned Caddy edge cannot front native PM2 processes, and the
  // single-server preset is host-nginx by definition.
  const edge =
    answers.edge ?? (requestedDomains === 'external-proxy' || hostProxyTargets.has(target) ? 'host-nginx' : 'caddy');
  const hostOwnsEdge = edge !== 'caddy';
  // The public hostname layout is independent of who serves it.
  const publicMode =
    answers.publicMode ??
    (requestedDomains && requestedDomains !== 'external-proxy' ? requestedDomains : 'per-app-domains');
  const tls =
    legacyTlsAliases[answers.tls] ??
    (answers.tls === 'external' ? (edge === 'host-nginx' ? 'certbot' : 'none') : answers.tls) ??
    (edge === 'caddy' ? 'acme' : edge === 'host-nginx' ? 'certbot' : 'none');

  return {
    ...answers,
    target,
    edge,
    publicMode,
    tls,
    database: answers.database ?? 'bundled-db',
    images: answers.images ?? 'registry',
    // Static SPA serving is only valid where the dist tree is on the host (PM2).
    frontendMode: answers.frontendMode ?? (answers.target === 'pm2' ? 'static' : 'proxy'),
    // Wire value consumed by scripts/compose-production.mjs.
    domains: hostOwnsEdge ? 'external-proxy' : publicMode,
    profiles: answers.profiles ?? [],
  };
}

/**
 * Map the axes onto the two env values the Compose wrapper understands. Pure.
 * `publicMode` additionally drives EXTERNAL_PROXY_PUBLIC_MODE when a host proxy owns the edge.
 */
export function deriveComposeEnv({ edge, publicMode, tls }) {
  if (edge === 'caddy') {
    return { domainMode: publicMode, tlsMode: tls === 'provided' ? 'provided' : 'automatic', publicMode: undefined };
  }
  return { domainMode: 'external-proxy', tlsMode: 'external', publicMode };
}

function assertOneOf(value, allowed, label) {
  if (!allowed.includes(value)) {
    throw new Error(`${label} must be one of ${allowed.join(', ')} (received "${value}").`);
  }
}

/**
 * The edge x TLS validity matrix. Each invalid cell names the axis that has to
 * change, so the wizard can never emit a topology the runtime would reject.
 */
function assertEdgeTls({ edge, tls, publicMode, profiles }) {
  const allowed = { caddy: ['acme', 'provided'], 'host-nginx': ['certbot', 'provided'], none: ['none'] };
  if (!allowed[edge].includes(tls)) {
    const reason = {
      'caddy:certbot': 'Certbot runs on the host; use --edge=host-nginx or --tls=acme.',
      'caddy:none': 'A Compose-owned Caddy edge must own certificates: use --tls=acme or --tls=provided.',
      'host-nginx:acme': 'ACME here is issued by Certbot on the host: use --tls=certbot.',
      'host-nginx:none': 'Host nginx serves HTTPS: use --tls=certbot or --tls=provided.',
      'none:acme': 'With --edge=none nothing in this repo terminates TLS: use --tls=none.',
      'none:certbot': 'With --edge=none nothing in this repo terminates TLS: use --tls=none.',
      'none:provided': 'With --edge=none nothing in this repo terminates TLS: use --tls=none.',
    };
    throw new Error(
      `--edge=${edge} is incompatible with --tls=${tls}. ${reason[`${edge}:${tls}`] ?? `Allowed: ${allowed[edge].join(', ')}.`}`,
    );
  }
  // Caddy-only limitation: docker/caddy/Caddyfile.single-domain ships no bot site
  // fragments. The host-nginx renderer does support bots on a single domain.
  if (edge === 'caddy' && publicMode === 'single-domain' && profiles.some((p) => edgeProfiles.includes(p))) {
    throw new Error(
      'Optional Telegram/Discord profiles require --domains=per-app-domains with --edge=caddy (or use --edge=host-nginx).',
    );
  }
}

const step = (title, command, args, extra = {}) => ({ title, command, args, ...extra });

function composeFlags({ database, domains, tls, profiles }) {
  const flags = [`--database=${database}`, `--domains=${domains}`, `--tls=${tls}`];
  if (profiles.length > 0) flags.push(`--profile=${profiles.join(',')}`);
  return flags;
}

/** Steps that make host nginx serve the loopback-only Compose stack. */
function hostNginxSteps(answers) {
  const envArgs = [
    `--production-env=${answers.envFile ?? '.env.production'}`,
    ...(answers.serverEnv ? [`--server-env=${answers.serverEnv}`] : []),
  ];
  const steps = [
    step(
      'Render host nginx configuration',
      process.execPath,
      [
        'scripts/single-server-deployment.mjs',
        'render-nginx',
        ...envArgs,
        `--phase=${answers.tls === 'certbot' ? 'http' : 'https'}`,
        `--frontend-mode=${answers.frontendMode}`,
        '--output=/etc/nginx/conf.d/nest-react-boilerplate.conf',
      ],
      { sudo: true },
    ),
    step('Test and reload nginx', 'nginx', ['-t'], { sudo: true }),
  ];
  if (answers.tls === 'certbot') {
    steps.push(
      step(
        'Obtain or renew certificates',
        process.execPath,
        ['scripts/single-server-deployment.mjs', 'certificate-domains', ...envArgs],
        {
          sudo: true,
          note: 'feed the printed domains to certbot certonly --webroot -w /var/www/certbot',
        },
      ),
    );
  }
  return steps;
}

function composePlan(answers) {
  const { skipValidate, edge, images } = answers;
  const localImages = images === 'local';
  const flags = composeFlags(answers);
  const compose = (subcommand, extraArgs = []) => [
    'scripts/compose-production.mjs',
    ...subcommand,
    ...flags,
    ...extraArgs,
  ];
  const wire = deriveComposeEnv(answers);
  const steps = [];
  if (answers.provisionHost) {
    steps.push(
      step('Provision the host', resolveHostController(answers), ['provision'], {
        sudo: true,
        note: 'installs Docker, Node, nginx, and certbot',
      }),
    );
  }
  steps.push(
    step('Scaffold environment and secrets', process.execPath, [
      'scripts/compose-production-init.mjs',
      `--database=${answers.database}`,
      // Persist the whole topology so the Compose wrapper, the host-nginx renderer,
      // and serverctl all read the same selection instead of the example defaults.
      `--domain-mode=${wire.domainMode}`,
      `--tls-mode=${wire.tlsMode}`,
      ...(wire.publicMode ? [`--public-mode=${wire.publicMode}`] : []),
      `--image-source=${images}`,
      ...(answers.profiles.length > 0 ? [`--profile=${answers.profiles.join(',')}`] : []),
      ...(answers.domain ? [`--domain=${answers.domain}`] : []),
      ...(answers.registry ? [`--registry=${answers.registry}`] : []),
      ...(answers.imageTag ? [`--image-tag=${answers.imageTag}`] : []),
    ]),
  );
  if (!skipValidate) {
    steps.push(
      step('Validate deployment configuration', process.execPath, ['scripts/deploy-validate.mjs', '--mode=docker']),
    );
  }
  steps.push(step('Render merged Compose model', process.execPath, compose(['config'])));
  if (localImages) {
    steps.push(step('Build images from source', process.execPath, compose(['build'])));
  } else {
    steps.push(step('Pull release images', process.execPath, compose(['pull'])));
  }
  steps.push(step('Start the production stack', process.execPath, compose(['up', '-d'])));
  if (edge === 'host-nginx') steps.push(...hostNginxSteps(answers));
  steps.push(step('Report running services', process.execPath, compose(['ps'])));
  return { steps, warnings: composeWarnings(answers) };
}

function composeWarnings({ database, edge, tls, images, publicMode }) {
  const warnings = [];
  if (edge === 'caddy') {
    warnings.push('Point DNS at this host before starting: Caddy issues certificates for every configured hostname.');
  }
  if (edge === 'host-nginx') {
    warnings.push(
      `DNS for every ${publicMode} hostname must resolve to this host before Certbot runs; app ports stay on 127.0.0.1.`,
    );
  }
  if (edge === 'none') {
    warnings.push('All app ports stay bound to 127.0.0.1 — point your own proxy at them and terminate TLS there.');
  }
  if (tls === 'provided') {
    warnings.push('Set EDGE_TLS_CERT_FILE / EDGE_TLS_KEY_FILE to a certificate covering the apex and every subdomain.');
  }
  if (database === 'external-db') {
    warnings.push('Fill docker/secrets/database_url.txt with the managed Postgres connection string.');
  }
  warnings.push(
    images === 'local'
      ? 'Images are built on this host and tagged from the current commit; the working tree must be clean.'
      : 'Set IMAGE_TAG in .env.production to a published immutable tag (sha-<git-sha>).',
  );
  return warnings;
}

function pm2Plan(answers) {
  const { skipValidate, profiles, database, edge } = answers;
  // The SSR site is a process, unlike the static SPAs nginx serves directly.
  const env = derivePm2Flags({ profiles, siteProcess: answers.frontendMode === 'static' });

  const nativeData = database === 'native';
  const secretsEnv = answers.secretsEnvFile ?? '.env.pm2-secrets';
  const wire = deriveComposeEnv(answers);
  const steps = [];
  if (nativeData) {
    // Host-installed data services, so the deployment needs no containers at all.
    // Passwords are generated, never typed; re-running never resets them.
    steps.push(
      step(
        'Install PostgreSQL and Redis on this host',
        process.execPath,
        ['scripts/native-datastores.mjs', 'install'],
        {
          sudo: true,
          note: 'apt packages, loopback-only binds',
        },
      ),
    );
  }
  steps.push(
    // Shared with serverctl's RUNTIME_MODE=native path so ordering cannot drift.
    ...buildNativeBuildPlan(),
    // PM2 reads secrets from the environment, so generate the same material the
    // container paths generate and emit it as a 0600 env file to source.
    step('Generate runtime secrets', process.execPath, [
      'scripts/compose-production-init.mjs',
      `--database=${database}`,
      `--domain-mode=${wire.domainMode}`,
      `--tls-mode=${wire.tlsMode}`,
      ...(wire.publicMode ? [`--public-mode=${wire.publicMode}`] : []),
      `--frontend-mode=${answers.frontendMode}`,
      ...(answers.profiles.length > 0 ? [`--profile=${answers.profiles.join(',')}`] : []),
      ...(answers.domain ? [`--domain=${answers.domain}`] : []),
      `--emit-env=${secretsEnv}`,
    ]),
  );
  if (nativeData) {
    steps.push(
      step(
        'Create the database role and apply generated passwords',
        process.execPath,
        ['scripts/native-datastores.mjs', 'configure', `--secrets-env=${secretsEnv}`],
        { sudo: true },
      ),
    );
  }
  if (!skipValidate) {
    steps.push(
      step('Validate deployment configuration', process.execPath, ['scripts/deploy-validate.mjs', '--mode=pm2']),
    );
  }
  // This path sources its secrets from the emitted env file, so it needs no wrapper.
  steps.push(...buildNativeStartPlan({ pm2Flags: env }));
  // Only render an edge we actually own; --edge=none leaves it to the operator.
  if (edge === 'host-nginx') steps.push(...hostNginxSteps(answers));
  return {
    steps,
    warnings: [
      'Generated secrets land in .env.pm2-secrets (0600). Source it before `pm2 start`: `set -a; . ./.env.pm2-secrets; set +a`.',
      nativeData
        ? 'PostgreSQL and Redis run on this host bound to 127.0.0.1 with generated passwords; nothing else needs pasting except provider tokens.'
        : 'Export DATABASE_URL and REDIS_URL for your existing data services before starting.',
      answers.frontendMode === 'static'
        ? 'nginx serves the built SPAs directly from dist/apps/frontend/*; rebuild before reloading after a release.'
        : 'Serve the built SPAs from dist/apps/frontend/* with your proxy (PM2 runs backends only).',
      'Run `pm2 startup` once so the saved process list is restored on reboot.',
    ],
  };
}

function helmPlan(answers) {
  const releaseName = answers.releaseName ?? 'nest-react-boilerplate';
  const namespace = answers.namespace ?? releaseName;
  const steps = [];
  if (!answers.skipValidate) {
    steps.push(
      step('Validate deployment configuration', process.execPath, ['scripts/deploy-validate.mjs', '--mode=helm']),
    );
  }
  steps.push(
    step('Deploy the Helm release', 'helm', [
      'upgrade',
      '--install',
      releaseName,
      '.helm',
      '--namespace',
      namespace,
      '--create-namespace',
      '-f',
      '.helm/values.yaml',
      '-f',
      '.helm/values-production.yaml',
      '--atomic',
      '--wait',
      '--timeout',
      '10m',
    ]),
  );
  steps.push(step('Report rollout status', 'kubectl', ['get', 'pods,job,svc,ingress', '--namespace', namespace]));
  return {
    steps,
    warnings: [
      'Publish sha-<git-sha> images and pin them in .helm/values-production.yaml (scripts/update-deploy-tags.mjs) before upgrading.',
      'Provide the application Secret (secrets.existingSecret) plus a registry pull secret for private images.',
      'Postgres, Redis, ingress, DNS, and cert-manager are owned by the platform, not this chart.',
    ],
  };
}

/**
 * Where the privileged host controller lives. On a provisioned host it is on PATH;
 * before bootstrap it is only in the checkout.
 */
export function resolveHostController(answers = {}) {
  return answers.hostController ?? 'nrb-server';
}

/**
 * Resolve `--preset` (and the deprecated `--target=single-server`) into axis
 * values. Returns the effective answers plus any deprecation notice.
 */
export function applyPreset(rawAnswers = {}) {
  const notices = [];
  let presetName = rawAnswers.preset;
  // Back-compat: single-server used to be a target. Keep old runbooks working.
  if (!presetName && rawAnswers.target === 'single-server') {
    presetName = 'single-server';
    notices.push('--target=single-server is deprecated; it now resolves to --preset=single-server.');
  }
  if (!presetName) return { answers: rawAnswers, notices, preset: undefined };
  const preset = deployPresets[presetName];
  if (!preset) throw new Error(`Unknown preset "${presetName}". Available: ${presetNames.join(', ')}.`);
  const { summary, ...axes } = preset;
  const explicit = { ...rawAnswers };
  if (explicit.target === 'single-server') delete explicit.target;
  // Explicit flags win over the preset.
  return { answers: { ...axes, ...explicit }, notices, preset: presetName };
}

/** Turn answers into an ordered, executable plan. Pure. */
export function buildDeployPlan(rawAnswers = {}) {
  const { answers: presetAnswers, notices, preset } = applyPreset(rawAnswers);
  const answers = normalizeAnswers(presetAnswers);
  assertOneOf(answers.target, deployTargets, 'Unsupported target');
  assertOneOf(answers.database, databaseModes, 'Database mode');
  assertOneOf(answers.publicMode, publicModes, 'Domain mode');
  assertOneOf(answers.edge, edgeModes, 'Edge mode');
  assertOneOf(answers.tls, tlsModes, 'TLS mode');
  assertOneOf(answers.images, imageSources, 'Image source');
  for (const profile of answers.profiles) assertOneOf(profile, supportedProfiles, 'Profile');
  if (answers.target !== 'helm') assertEdgeTls(answers);
  // A host-installed PostgreSQL only makes sense for the native runtime: the
  // Compose wrapper has no overlay for it and the Helm chart never provisions data
  // services. Containers reaching a host database need bridge/pg_hba changes that
  // this tool deliberately does not make.
  if (answers.database === 'native' && answers.target !== 'pm2') {
    throw new Error(
      `--database=native installs PostgreSQL on this host and is only supported with --target=pm2 (received --target=${answers.target}). Use --database=external-db to point a container/cluster deployment at an existing server.`,
    );
  }

  const planners = { compose: composePlan, pm2: pm2Plan, helm: helmPlan };
  const { steps, warnings } = planners[answers.target](answers);
  return { target: answers.target, preset, notices, answers, steps, warnings };
}

const FLAG_ALIASES = {
  '--target': 'target',
  '--preset': 'preset',
  '--domain': 'domain',
  '--database': 'database',
  '--domains': 'publicMode',
  '--edge': 'edge',
  '--tls': 'tls',
  '--images': 'images',
  '--profile': 'profiles',
  '--image-tag': 'imageTag',
  '--registry': 'registry',
  '--namespace': 'namespace',
  '--release': 'releaseName',
  '--server-env': 'serverEnv',
  // Deliberately not `--env-file`: Node 24 reserves that flag and would consume it.
  '--production-env': 'envFile',
  '--host-controller': 'hostController',
};

export function parseDeployArgs(argv = []) {
  const parsed = { profiles: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === '--yes' || item === '-y') {
      parsed.yes = true;
      continue;
    }
    if (item === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }
    if (item === '--skip-validate') {
      parsed.skipValidate = true;
      continue;
    }
    if (item === '--source-build') {
      // Back-compat alias for the images axis.
      parsed.images = 'local';
      continue;
    }
    if (item === '--provision-host') {
      parsed.provisionHost = true;
      continue;
    }
    if (item === '--help' || item === '-h') {
      parsed.help = true;
      continue;
    }
    const [flag, inlineValue] = item.startsWith('--') && item.includes('=') ? item.split(/=(.*)/su) : [item, undefined];
    const key = FLAG_ALIASES[flag];
    if (!key) throw new Error(`Unknown argument: ${item}`);
    const value = inlineValue ?? argv[++i];
    if (value === undefined) throw new Error(`${flag} requires a value.`);
    parsed[key] = key === 'profiles' ? value.split(/[\s,]+/u).filter(Boolean) : value;
  }
  if (parsed.profiles === undefined) delete parsed.profiles;
  return parsed;
}

// ---------------------------------------------------------------------------
// Interactive wizard + executor (not part of the pure planning surface)
// ---------------------------------------------------------------------------

function usage() {
  console.log(`Usage: pnpm deploy [options]

Runs a full deployment for the selected runtime. With no options it asks.

Runtime:
  --target=<${deployTargets.join('|')}>
                                      single-server = compose + host-nginx + certbot + provisioning

Composable axes (all optional, all independent):
  --domains=<${publicModes.join('|')}>
                                      public hostname layout
  --edge=<${edgeModes.join('|')}>       who terminates public traffic
  --tls=<${tlsModes.join('|')}>  who issues/holds certificates
  --database=<${databaseModes.join('|')}>
  --images=<${imageSources.join('|')}>            pull published images, or build them here
  --profile=<csv>                     ${supportedProfiles.join(', ')}
  --provision-host                    install Docker/Node/nginx/certbot first (privileged)

Valid edge/TLS pairs: caddy+{acme,provided} | host-nginx+{certbot,provided} | none+none

Identity (written into .env.production):
  --domain=<base DNS domain>          e.g. acme.example
  --registry=<ref>  --image-tag=<sha-...>

Other:
  --release=<name> --namespace=<ns>   Helm target
  --production-env=<path> --server-env=<path>
  --source-build                      alias for --images=local
  --skip-validate                     Skip the pre-flight validation gate
  --dry-run                           Print the plan; execute nothing
  --yes, -y                           Consent up front; required to execute without a terminal
  --help, -h`);
}

async function ask(rl, question, options, fallback) {
  const list = options.map((option, index) => `  ${index + 1}) ${option}${option === fallback ? ' (default)' : ''}`);
  const answer = (await rl.question(`\n${question}\n${list.join('\n')}\n> `)).trim();
  if (answer === '') return fallback;
  const byIndex = Number.parseInt(answer, 10);
  if (Number.isInteger(byIndex) && byIndex >= 1 && byIndex <= options.length) return options[byIndex - 1];
  if (options.includes(answer)) return answer;
  console.log(`"${answer}" is not one of: ${options.join(', ')}`);
  return ask(rl, question, options, fallback);
}

async function runWizard(parsed) {
  const { createInterface } = await import('node:readline/promises');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answers = { ...parsed };
    if (!answers.target) {
      const labels = deployTargets.map((target) => `${target} — ${TARGET_SUMMARY[target]}`);
      const choice = await ask(rl, 'Where are you deploying?', labels, labels[0]);
      answers.target = deployTargets[labels.indexOf(choice)];
    }
    // Every axis is asked independently: they compose freely.
    if (answers.target === 'compose' || answers.target === 'single-server') {
      answers.database ??= await ask(rl, 'Database:', databaseModes, 'bundled-db');
      answers.publicMode ??= await ask(rl, 'Domain style:', publicModes, 'per-app-domains');
      answers.edge ??= await ask(
        rl,
        'Who terminates public traffic?',
        [
          'caddy — Compose runs the HTTPS edge',
          'host-nginx — nginx on this host proxies to loopback ports',
          'none — you point your own proxy at loopback ports',
        ],
        'caddy — Compose runs the HTTPS edge',
      ).then((choice) => choice.split(' ')[0]);
      const tlsChoices = { caddy: ['acme', 'provided'], 'host-nginx': ['certbot', 'provided'], none: ['none'] }[
        answers.edge
      ];
      answers.tls ??=
        tlsChoices.length === 1 ? tlsChoices[0] : await ask(rl, 'Certificates:', tlsChoices, tlsChoices[0]);
      answers.images ??= await ask(
        rl,
        'Runtime images:',
        ['registry — pull published sha-<git-sha> images', 'local — build them on this host'],
        'registry — pull published sha-<git-sha> images',
      ).then((choice) => choice.split(' ')[0]);
      if (answers.edge === 'host-nginx' && answers.provisionHost === undefined) {
        const provision = await ask(rl, 'Install Docker/nginx/certbot on this host first?', ['no', 'yes'], 'no');
        answers.provisionHost = provision === 'yes';
      }
    }
    if (answers.target === 'helm') {
      answers.releaseName ??= (await rl.question('\nHelm release name [nest-react-boilerplate]: ')).trim() || undefined;
      answers.namespace ??= (await rl.question('Namespace [release name]: ')).trim() || undefined;
    }
    if (!answers.domain && answers.target !== 'helm') {
      answers.domain = (await rl.question('\nBase domain (e.g. acme.example) [skip]: ')).trim() || undefined;
    }
    return answers;
  } finally {
    rl.close();
  }
}

function printPlan(plan, { dryRun }) {
  const { target, answers, steps, warnings } = plan;
  console.log(`\n=== Deployment plan: ${target} ===`);
  console.log(`  ${TARGET_SUMMARY[target]}`);
  if (target === 'compose' || target === 'single-server') {
    console.log(
      `  database=${answers.database}  domains=${answers.publicMode}  edge=${answers.edge}  tls=${answers.tls}  images=${answers.images}`,
    );
  }
  if (answers.profiles.length > 0) console.log(`  profiles=${answers.profiles.join(', ')}`);
  console.log('\nSteps:');
  steps.forEach((item, index) => {
    const prefix = item.sudo ? 'sudo ' : '';
    console.log(`  ${index + 1}. ${item.title}\n       ${prefix}${item.command} ${item.args.join(' ')}`);
  });
  if (warnings.length > 0) {
    console.log('\nBefore this can succeed:');
    for (const warning of warnings) console.log(`  ! ${warning}`);
  }
  if (dryRun) console.log('\n(dry run — nothing was executed)');
}

function executePlan(plan) {
  const alreadyRoot = typeof process.getuid === 'function' && process.getuid() === 0;
  for (const [index, item] of plan.steps.entries()) {
    console.log(`\n==> [${index + 1}/${plan.steps.length}] ${item.title}`);
    if (item.note) console.log(`    (${item.note})`);
    // Privileged steps must actually elevate. `sudo env K=V …` preserves the
    // step's own environment across the privilege boundary.
    const needsSudo = item.sudo && !alreadyRoot;
    const stepEnv = item.env ?? {};
    const command = needsSudo ? 'sudo' : item.command;
    const args = needsSudo
      ? ['env', ...Object.entries(stepEnv).map(([key, value]) => `${key}=${value}`), item.command, ...item.args]
      : item.args;
    const result = spawnSync(command, args, {
      cwd: repoRoot,
      stdio: 'inherit',
      env: { ...process.env, ...stepEnv },
    });
    if (result.error?.code === 'ENOENT') {
      console.error(`\n"${item.command}" is not installed or not on PATH — install it and re-run.`);
      process.exit(127);
    }
    if (result.status !== 0) {
      console.error(`\nStep failed: ${item.title} (exit ${result.status}). Nothing after this ran.`);
      process.exit(result.status ?? 1);
    }
  }
  console.log('\nDeployment complete.');
}

/**
 * Decide what an invocation is allowed to do. Consent to mutate a production host comes from
 * `--yes` or from a human answering the prompt — never from the absence of a terminal, which is
 * what a pipe, a CI job, and an agent shell all look like.
 */
export function resolveExecutionMode({ yes = false, dryRun = false, isTty = false } = {}) {
  if (dryRun) return 'plan-only';
  if (yes) return 'execute';
  return isTty ? 'interactive' : 'refuse';
}

async function main() {
  const parsed = parseDeployArgs(process.argv.slice(2));
  if (parsed.help) {
    usage();
    return;
  }
  const mode = resolveExecutionMode({
    yes: parsed.yes,
    dryRun: parsed.dryRun,
    isTty: Boolean(process.stdin.isTTY),
  });
  const answers = mode === 'interactive' ? await runWizard(parsed) : parsed;
  const plan = buildDeployPlan(answers);
  printPlan(plan, { dryRun: parsed.dryRun });
  if (mode === 'plan-only') return;
  if (mode === 'refuse') {
    console.error(
      '\nRefusing to deploy: stdin is not a terminal, so nothing here can confirm the plan above.' +
        '\nRe-run with --dry-run to inspect it, or --yes to execute it unattended.',
    );
    process.exit(1);
  }

  // Only block when a step actually needs the privileged host controller and it is
  // absent — the edge/TLS axes are usable without it.
  const needsController = plan.steps.some((item) => item.command === 'nrb-server');
  if (needsController && !existsSync('/usr/local/sbin/nrb-server')) {
    console.error(
      '\nHost provisioning needs the privileged controller, which is not installed here.' +
        '\nRun `sudo deploy/single-server/bootstrap.sh` on the target host first, or drop --provision-host.',
    );
    process.exit(1);
  }
  if (mode === 'interactive') {
    const { createInterface } = await import('node:readline/promises');
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const confirmed = (await rl.question('\nRun these steps now? [y/N] ')).trim().toLowerCase();
    rl.close();
    if (confirmed !== 'y' && confirmed !== 'yes') {
      console.log('Aborted. Re-run with --dry-run to inspect, or --yes to skip this prompt.');
      return;
    }
  }
  executePlan(plan);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(`deploy failed: ${error.message}`);
    process.exit(1);
  });
}
