import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
import { composeDeclaredSecrets, composeMountedSecrets, parseDeclaredSecrets } from './declared-secrets.mjs';
import { renderNginxFullstackConfig } from './generate-nginx-config.mjs';

const jiti = createJiti(import.meta.url);
const { appPublicHostname } = await jiti.import('../packages/tooling/src/setup/catalog.ts');
const { defaultDeploymentConfig } = await jiti.import('../packages/tooling/src/setup/schema.ts');
const { configuredForges, loadCiContract } = await jiti.import(
  '../packages/tooling/src/commands/ci/check-pipelines.ts',
);
const { extractJob } = await jiti.import('../packages/tooling/src/commands/ci/pipeline-contract.ts');
const documentedDomain = {
  publicDomain: defaultDeploymentConfig.publicDomain,
  primaryApp: defaultDeploymentConfig.primaryApp,
};

// The checkout under validation. It is this script's own parent by default; `--root=` points it
// at a materialized checkout instead, which is how the forge-neutral assertions below are proved
// against a tree that ships a different set of pipelines than this one.
const rootArgument = process.argv.find((arg) => arg.startsWith('--root='))?.split('=', 2)[1];
const rootDir = resolve(rootArgument ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
const workspacePath = (path) => join(rootDir, path);
const read = (path) => readFileSync(workspacePath(path), 'utf8');
const treeContainsFiles = (root) =>
  existsSync(root) &&
  readdirSync(root, { withFileTypes: true }).some(
    (entry) => !entry.isDirectory() || treeContainsFiles(join(root, entry.name)),
  );
const has = (text, needle, label = needle) =>
  assert.ok(text.includes(needle), `Missing expected deployment config: ${label}`);
// Quote-agnostic: try single-quote and double-quote variants.
const hasQ = (text, pattern, label = pattern) => {
  const dq = pattern.replace(/'/g, '"');
  const sq = pattern.replace(/"/g, "'");
  assert.ok(text.includes(dq) || text.includes(sq), `Missing expected deployment config: ${label}`);
};
const before = (text, first, second, label = `${first} before ${second}`) => {
  const firstIndex = text.indexOf(first);
  const secondIndex = text.indexOf(second);
  assert.ok(firstIndex >= 0, `Missing ${first} while checking ${label}`);
  assert.ok(secondIndex >= 0, `Missing ${second} while checking ${label}`);
  assert.ok(firstIndex < secondIndex, `Expected ${label}`);
};
const section = (text, start, end) => {
  const startIndex = text.indexOf(start);
  assert.ok(startIndex >= 0, `Missing section ${start}`);
  const endIndex = end ? text.indexOf(end, startIndex + start.length) : -1;
  return text.slice(startIndex, endIndex >= 0 ? endIndex : undefined);
};

const modeArg = process.argv.find((arg) => arg.startsWith('--mode='));
const selectedMode = modeArg?.split('=', 2)[1] ?? 'all';
const supportedModes = new Set(['all', 'docker', 'helm']);
assert.ok(supportedModes.has(selectedMode), `Unsupported deployment config validation mode: ${selectedMode}`);
const validateHelmStatic = selectedMode !== 'docker';

const yamlMapEntry = (text, key, indent = 2) => {
  const spaces = ' '.repeat(indent);
  const marker = `${spaces}${key}:`;
  const lines = text.split('\n');
  const startIndex = lines.findIndex((line) => line.startsWith(marker));
  assert.ok(startIndex >= 0, `Missing YAML entry ${key}`);
  let endIndex = lines.length;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith(spaces) && line[spaces.length] && line[spaces.length] !== ' ') {
      endIndex = index;
      break;
    }
    if (line.length > 0 && !line.startsWith(spaces)) {
      endIndex = index;
      break;
    }
  }
  return lines.slice(startIndex, endIndex).join('\n');
};

const dockerfile = read('Dockerfile');
const nxignore = read('.nxignore');
const migratorRun = read('docker/migrator-run.mjs');
const deploymentProvider = read('packages/tooling/src/commands/db/deployment-provider.ts');
const rootPackageJson = JSON.parse(read('package.json'));
const pinnedPnpm = rootPackageJson.packageManager?.split('@')[1];
assert.ok(pinnedPnpm, 'package.json packageManager must pin a pnpm version');
has(dockerfile, `ARG PNPM_VERSION=${pinnedPnpm}`, `Dockerfile pnpm version must match packageManager (${pinnedPnpm})`);
has(dockerfile, 'COPY .npmrc .nxignore nx.json', 'Docker source builds copy the Nx output ignore policy');
assert.ok(
  nxignore.split(/\r?\n/u).some((line) => line.trim() === 'dist/'),
  'Nx must ignore generated dist project metadata during multi-stage Docker builds.',
);
for (const input of [
  'package.json',
  'pnpm-workspace.yaml',
  'pnpm-lock.yaml',
  'closure.json',
  'nrb.config.json',
  'workspace.json',
]) {
  has(dockerfile, `COPY --from=nrb-closure ${input} `, `Docker consumes ${input} from the named closure context`);
}
has(
  dockerfile,
  'COPY --from=nrb-closure . ./.nrb/closure',
  'Docker consumes closure lock integrity metadata from the named closure context',
);
for (const forbidden of ['COPY .nrb/', 'COPY nrb.config.json']) {
  assert.ok(
    !dockerfile.includes(forbidden),
    `Dockerfile must not read closure metadata from the default context: ${forbidden}`,
  );
}
has(
  dockerfile,
  '--mount=type=cache,target=/workspace/.nx/cache,sharing=locked',
  'Docker builder shares Nx task cache through a disposable BuildKit mount',
);
before(
  dockerfile,
  'COPY --from=nrb-closure pnpm-lock.yaml ./pnpm-lock.yaml',
  'RUN pnpm install --frozen-lockfile --offline',
  'Docker copies selected dependency metadata before installing source-build dependencies',
);
before(
  dockerfile,
  'RUN pnpm install --frozen-lockfile --offline',
  'COPY apps ./apps',
  'Docker copies application source only after the selected dependency layer is cached',
);
assert.ok(
  !dockerfile.includes('COPY docker/workspace-manifests/ ./'),
  'Docker source builds must not fall back to the all-workspace manifest tree.',
);
assert.ok(
  !treeContainsFiles(workspacePath('docker/workspace-manifests')) &&
    !existsSync(workspacePath('scripts/sync-docker-workspace-manifests.mjs')),
  'Retired Docker workspace manifest artifacts and their synchronizer must be removed.',
);
has(
  dockerfile,
  'deployment-artifact.ts link-source-dependencies',
  'Docker links only selected app roots to the flattened source dependency closure',
);
has(dockerfile, 'FROM nginxinc/nginx-unprivileged:', 'unprivileged frontend base image');
has(
  dockerfile,
  'run-many -t build export',
  'Dockerfile builder supports non-build frontend targets such as mobile export',
);
has(
  dockerfile,
  'deployment-artifact.ts stage "${PROJECT}" /site-deploy',
  'site runtime stages only its selected-closure deployment artifact',
);
has(
  dockerfile,
  'RUN pnpm install --prod --prefer-offline --no-frozen-lockfile --ignore-scripts',
  'site runtime installs only staged production dependencies',
);
has(
  dockerfile,
  'ARG NGINX_CONFIG=docker/nginx-fullstack.conf',
  'frontend nginx config build arg defaults to same-origin fullstack proxy',
);
has(
  dockerfile,
  'COPY ${NGINX_CONFIG} /etc/nginx/conf.d/default.conf',
  'frontend nginx config copy is build-arg selectable',
);
const nginxFullstack = read('docker/nginx-fullstack.conf');
const nginxSpa = read('docker/nginx-spa.conf');
const landingAstroConfig = read('apps/frontend/landing/astro.config.mjs');
has(landingAstroConfig, 'csp: true', 'Astro landing emits a hash-based hydration CSP');
has(
  dockerfile,
  'if [ "${NX_PROJECT}" = landing-app ]',
  'frontend image scopes its CSP relaxation to the Astro landing project',
);
has(
  dockerfile,
  'grep -Eq \'http-equiv="content-security-policy"[^>]+sha256-\' /usr/share/nginx/html/index.html',
  'frontend image requires an Astro-generated hash CSP before relaxing its outer policy',
);
has(
  dockerfile,
  `sed -i "s/script-src 'self';/script-src 'self' 'unsafe-inline';/g"`,
  'frontend image admits Astro hydration only behind the generated hash policy',
);
/**
 * The runtime QA fixture is a property of whichever job runs the ops gates, not of one forge's
 * YAML. scripts/ci/gates.json already says which job that is on each forge, so ask it instead of
 * opening `.github/workflows/ci.yml` by name — a checkout that keeps a single non-GitHub forge
 * used to die here on ENOENT before it asserted anything.
 */
const ciContract = loadCiContract(rootDir);
const opsGate = ciContract.gates.find(({ id }) => id === 'world-class-ops');
assert.ok(opsGate, 'scripts/ci/gates.json must inventory the world-class-ops gate that runs the runtime QA fixture');
const runtimeFixtureForges = [];
const releasePipelinesValidated = [];
const releasePipelinesDeferred = [];
for (const forge of configuredForges(rootDir)) {
  const jobId = opsGate.jobs[forge.id];
  // An unmapped gate is ci-pipeline-parity's finding to report, not this validator's.
  if (jobId === undefined) continue;
  const runtimeOpsJob = extractJob(read(forge.pipeline), jobId, forge.jobStyle);
  assert.ok(runtimeOpsJob, `${forge.pipeline} declares no job "${jobId}" to carry the runtime QA fixture`);
  for (const expected of [
    "AUTH_TELEGRAM_ENABLED: 'true'",
    "TELEGRAM_BOT_TOKEN: '123456789:test-bot-token'",
    "VITE_TELEGRAM_AUTH_ENABLED: 'true'",
    "NOTIFICATION_PAYLOAD_ENCRYPTION_KEY: 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc='",
    'CONTAINER_DATABASE_URL: postgres://postgres:postgres@postgres:5432/nest_react_boilerplate',
    "SITE_APP_PORT: '4203'",
    'COMPOSE_PROFILES: postgres,redis,nats,admin-app-api,user-app-api,auth-app-api,admin-app,user-app,landing-app',
  ]) {
    has(runtimeOpsJob, expected, `${forge.id} runtime QA Telegram TMA fixture ${expected}`);
  }
  runtimeFixtureForges.push(forge.id);
}
assert.ok(
  runtimeFixtureForges.length > 0,
  'No configured forge runs the runtime QA gates; scripts/ci/gates.json must map world-class-ops to a job on a pipeline this checkout ships.',
);
const assertNginxHardening = (text, label) => {
  for (const required of [
    'add_header X-Content-Type-Options "nosniff" always;',
    'add_header Referrer-Policy "strict-origin-when-cross-origin" always;',
    'location = /nginx-health',
    'location = /.env',
    'location ^~ /.git/',
    'location = /server-status',
    'location = /actuator/env',
  ]) {
    has(text, required, `${label} nginx DAST hardening: ${required}`);
  }
};
assertNginxHardening(nginxFullstack, 'same-origin fullstack');
assertNginxHardening(nginxSpa, 'standalone SPA');
has(dockerfile, 'USER 101', 'frontend runtime user 101');
has(dockerfile, 'EXPOSE 8080', 'frontend exposes unprivileged port 8080');
const migratorStage = section(dockerfile, 'FROM workspace AS migrator', 'FROM workspace AS builder');
before(
  migratorStage,
  'COPY docker/migrator-package.json ./docker/migrator-package.json',
  'deployment-artifact.ts stage-migrator /migrator',
  'migrator manifest is available before selected dependency staging',
);
has(
  migratorStage,
  'deployment-artifact.ts stage-migrator /migrator',
  'migrator stages only the selected provider dependency manifest',
);
has(migratorStage, 'USER 1000:1000', 'migrator image defaults to the numeric non-root node user');
has(
  migratorStage,
  'ENTRYPOINT ["/usr/local/bin/secret-entrypoint"]',
  'migrator loads file secrets and drops privileges through the shared entrypoint',
);
before(
  migratorStage,
  'ENTRYPOINT ["/usr/local/bin/secret-entrypoint"]',
  'CMD ["node", "docker/migrator-run.mjs"]',
  'migrator entrypoint before the standalone migration runner command',
);
has(
  migratorRun,
  'packages/tooling/src/commands/db/deployment-provider.ts',
  'migrator uses the filesystem-free deployment provider resolver',
);
has(migratorRun, 'providerCommandModulePath', 'migrator resolves the selected provider migration module directly');
has(migratorRun, 'migratePostgresDatabase', 'migrator dispatches directly to PostgreSQL migrations');
has(migratorRun, 'migrateMongoDatabase', 'migrator dispatches directly to MongoDB migrations');
assert.ok(
  !migratorRun.includes('resolveDatabaseMigrationProvider'),
  'Final migrator runtime must not load the local closure-aware provider resolver.',
);
for (const forbidden of ['.nrb', 'closure-workspace', '@nx/']) {
  assert.ok(
    !deploymentProvider.includes(forbidden),
    `Deployment provider resolver must remain filesystem-free and import-light: ${forbidden}`,
  );
}
assert.ok(
  !migratorStage.includes('COPY .nrb'),
  'Final migrator stage must not copy selected closure filesystem state.',
);
assert.ok(
  !migratorStage.includes('/usr/local/bin/pnpm'),
  'Migrator runtime must not include pnpm; migrations use the standalone Node runner.',
);

const localCompose = read('docker/docker-compose.yml');
const localMigrateService = yamlMapEntry(localCompose, 'migrate');
assert.ok(
  !localMigrateService.includes('command:'),
  'Local Compose must inherit the migrator image command instead of overriding it with workspace tooling.',
);
has(
  localCompose,
  'NATS_SERVERS: ${NATS_SERVERS:-nats://nats:4222}',
  'Local Compose addresses the profile-gated NATS service when it is selected',
);
const productionCompose = read('docker/docker-compose.prod.yml');
const productionMigrateCommand = section(
  productionCompose,
  'x-migrate-command: &migrate-command',
  'x-backend-healthcheck: &backend-healthcheck',
);
has(
  productionMigrateCommand,
  'exec node docker/migrator-run.mjs',
  'production Compose invokes the standalone migration runner after resolving the selected provider credential',
);
has(productionMigrateCommand, 'case "$${DATABASE_ENGINE:-}" in', 'production migration selects an explicit provider');
has(productionMigrateCommand, 'MONGODB_URI', 'production migration resolves MongoDB credentials');
has(
  productionMigrateCommand,
  'DATABASE_ENGINE must be selected by a production database overlay',
  'production migration fails closed without a provider overlay',
);
assert.ok(
  !productionMigrateCommand.includes('pnpm'),
  'Production migrations must not depend on the package manager removed from runtime images.',
);

// Backend images ship per-app production dependencies computed from each app's
// generated dist package.json + pruned lockfile, not the whole-workspace tree.
const backendDepsStage = section(dockerfile, 'FROM builder AS backend-deps', 'FROM node:${NODE_VERSION} AS backend');
has(
  backendDepsStage,
  'COPY --from=nrb-closure pnpm-workspace.yaml ./pnpm-workspace.yaml',
  'backend-deps retains the root override policy recorded in each generated lockfile',
);
has(
  backendDepsStage,
  'pnpm install --prod --prefer-offline --frozen-lockfile --ignore-scripts',
  'backend-deps installs the reviewed per-app production lockfile without re-resolution',
);
assert.ok(
  !backendDepsStage.includes('--no-frozen-lockfile') && !backendDepsStage.includes('--ignore-workspace'),
  'Backend dependency installation must not bypass the generated lockfile or its security overrides.',
);
has(
  backendDepsStage,
  'deployment-artifact.ts stage "${PROJECT}" /runtime',
  "backend-deps stages the app's selected transitive output closure",
);
has(backendDepsStage, 'WORKDIR /runtime', 'backend-deps installs outside the source workspace');
const backendStage = section(dockerfile, 'FROM node:${NODE_VERSION} AS backend', 'FROM nginxinc/nginx-unprivileged');
has(backendStage, 'USER 1000:1000', 'backend image defaults to the numeric non-root node user');
has(
  backendStage,
  'COPY --from=backend-deps /runtime/node_modules ./node_modules',
  'backend copies only the staged per-app node_modules',
);
has(
  backendStage,
  'COPY --from=backend-deps /runtime/package.json ./package.json',
  "backend copies the app's generated package.json alongside its node_modules",
);
has(backendStage, 'COPY --from=backend-deps /runtime/dist ./dist', 'backend copies only the staged output closure');
assert.ok(
  !dockerfile.includes('pnpm prune --prod'),
  'Backend images must install per-app dependencies instead of pruning the whole workspace tree.',
);
assert.ok(
  !backendStage.includes('COPY --from=prod-deps /workspace/node_modules'),
  'Backend image must not copy the whole-workspace node_modules.',
);
has(
  backendStage,
  'ENTRYPOINT ["/usr/local/bin/secret-entrypoint"]',
  'backend loads file secrets and drops privileges through the shared entrypoint',
);
has(
  backendStage,
  "setcap 'cap_net_bind_service=+ep'",
  'backend grants node permission to bind the unprivileged runtime to port 80',
);
has(
  backendStage,
  'ENV CONTAINER=true \\\n  NODE_ENV=production \\\n  PORT=80',
  'backend explicitly assigns container port 80',
);
has(backendStage, 'EXPOSE 80', 'backend exposes the API port');
has(
  backendStage,
  "require('./dist/libs/backend/common/i18n/libs/backend/common/i18n/lib/src')",
  'backend image verifies the canonical backend i18n runtime output',
);
const siteStage = section(dockerfile, 'FROM node:${NODE_VERSION} AS site-runtime', 'FROM nginxinc/nginx-unprivileged');
has(
  siteStage,
  `ENV CONTAINER=true \\
  NODE_ENV=production \\
  PORT=80`,
  'site runtime explicitly assigns container port 80',
);
has(siteStage, 'COPY --from=site-deps /site-deploy/dist ./dist', 'site runtime copies only staged Vike output');
assert.ok(!siteStage.includes('/workspace/dist'), 'Site runtime must not copy the full workspace dist tree.');
has(siteStage, 'USER node', 'site runtime runs as the non-root node user');
has(siteStage, 'EXPOSE 80', 'site runtime exposes the Vike server port');

const devCompose = read('docker/docker-compose.yml');
has(devCompose, 'http://127.0.0.1:8080/nginx-health', 'dev frontend healthcheck targets container port 8080');
has(devCompose, "published: '${ADMIN_APP_API_PORT:-3001}'", 'admin API explicit published port assignment');
assert.ok(!devCompose.includes(':-0}'), 'Development Compose must not request random host ports.');
const devBackendEnv = section(devCompose, 'x-backend-env:', '\nx-backend-healthcheck:');
has(devBackendEnv, 'NODE_ENV: ${NODE_ENV:-development}', 'dev Compose backend defaults to development NODE_ENV');
for (const migrationService of ['migrate', 'mongodb-migrate']) {
  const migrationBlock = section(devCompose, `  ${migrationService}:`, '\n\n  ');
  assert.ok(
    !migrationBlock.includes('command:'),
    `${migrationService} must inherit the image's Node migrator command instead of invoking pnpm.`,
  );
}
has(devBackendEnv, 'PORT: 80', 'dev Compose explicitly assigns backend container port 80');
has(
  devBackendEnv,
  'DATABASE_URL: ${CONTAINER_DATABASE_URL:-}',
  'dev Compose receives the explicitly selected container database URL',
);
has(devBackendEnv, 'DATABASE_ENGINE: ${DATABASE_ENGINE:-}', 'dev Compose passes explicit database engine selection');
has(devBackendEnv, 'MONGODB_URI: ${MONGODB_URI:-}', 'dev Compose passes explicit MongoDB URI selection');
assert.ok(
  !devBackendEnv.includes('DATABASE_URL: ${DATABASE_URL:-'),
  'Local Docker services must not inherit host DATABASE_URL; CI uses localhost for host-side QA tools.',
);
has(
  devBackendEnv,
  'SESSION_SECRET: ${SESSION_SECRET:-local-session-secret-change-me-32-chars}',
  'dev Compose uses a dedicated session secret default',
);
has(devBackendEnv, 'REDIS_URL: ${REDIS_URL:-redis://redis:6379/0}', 'dev Compose passes the Redis service URL');
has(devBackendEnv, 'NATS_SERVERS: ${NATS_SERVERS:-nats://nats:4222}', 'dev Compose passes the NATS service URL');
const devLandingService = section(devCompose, '  landing-app:', '\n\n  site-app:');
has(
  devLandingService,
  'FRONTEND_RUNTIME_ALLOW_LOOPBACK_HTTP: ${FRONTEND_RUNTIME_ALLOW_LOOPBACK_HTTP:-false}',
  'dev landing requires an explicit opt-in before emitting loopback HTTP destinations',
);
has(
  devLandingService,
  'LANDING_USER_APP_URL: ${LANDING_USER_APP_URL:-}',
  'dev landing receives the selected user-app destination',
);
has(
  devLandingService,
  'LANDING_ADMIN_APP_URL: ${LANDING_ADMIN_APP_URL:-}',
  'dev landing receives the selected admin-app destination',
);
has(
  devBackendEnv,
  'OTEL_EXPORTER_OTLP_ENDPOINT: ${OTEL_EXPORTER_OTLP_ENDPOINT:-http://otel-collector:4318}',
  'dev Compose passes the OTLP collector endpoint',
);
has(
  devBackendEnv,
  'AUTH_PROVIDER_TOKEN_ENCRYPTION_ENABLED: ${AUTH_PROVIDER_TOKEN_ENCRYPTION_ENABLED:-false}',
  'dev Compose keeps provider token storage opt-in',
);
const sessionSecretDefault = devBackendEnv.match(/SESSION_SECRET:\s*\$\{SESSION_SECRET:-([^}]+)\}/)?.[1];
assert.ok(sessionSecretDefault, 'Missing local Docker SESSION_SECRET default');
assert.ok(
  sessionSecretDefault.trim().length >= 32,
  'Local Docker SESSION_SECRET default must satisfy the production minimum length.',
);
const envExample = read('.env.example');
assert.ok(/^SESSION_SECRET=/m.test(envExample), 'Missing .env.example SESSION_SECRET setting');
const productionEnvExample = read('.env.production.example');
const servicePortAssignments = {
  ADMIN_APP_API_PORT: 3001,
  USER_APP_API_PORT: 3002,
  AUTH_APP_API_PORT: 3003,
  DISCORD_APP_API_PORT: 3007,
  TELEGRAM_BOT_API_PORT: 3013,
  ADMIN_APP_PORT: 4200,
  USER_APP_PORT: 4201,
  LANDING_APP_PORT: 4202,
  SITE_APP_PORT: 4203,
  MOBILE_APP_PORT: 4300,
};
assert.equal(
  new Set(Object.values(servicePortAssignments)).size,
  Object.keys(servicePortAssignments).length,
  'Service port assignments must be collision-free.',
);
for (const [variable, port] of Object.entries(servicePortAssignments)) {
  has(envExample, `${variable}=${port}`, `.env.example explicit ${variable}`);
  has(productionEnvExample, `${variable}=${port}`, `.env.production.example explicit ${variable}`);
}
for (const [path, port] of [
  ['apps/backend/admin/admin-app-api/src/main.ts', 3001],
  ['apps/backend/user/user-app-api/src/main.ts', 3002],
  ['apps/backend/auth/auth-app-api/src/main.ts', 3003],
  ['apps/backend/discord/discord-app-api/src/main.ts', 3007],
  ['apps/backend/telegram/telegram-bot-api/src/main.ts', 3013],
]) {
  has(read(path), `port: ${port}`, `${path} explicit port ${port}`);
}
has(read('apps/frontend/site/project.json'), 'SITE_APP_PORT=4203', 'site start target explicitly assigns port 4203');
for (const expected of [
  'SESSION_SECRET_FILE=./secrets/session_secret.txt',
  'AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY_FILE=./secrets/auth_provider_token_encryption_key.txt',
  'NOTIFICATION_PAYLOAD_ENCRYPTION_KEY_FILE=./secrets/notification_payload_encryption_key.txt',
  'REDIS_PASSWORD_FILE=./secrets/redis_password.txt',
]) {
  has(productionEnvExample, expected, `production env example reads ${expected} from a Docker secret file`);
}
assert.ok(!/AUTH_JWT_/u.test(productionEnvExample), 'Production env example must not configure JWT auth.');
has(productionEnvExample, 'RATE_LIMIT_STORE=redis', 'production env example forces shared Redis rate limiting');
has(productionEnvExample, 'REDIS_URL=redis://redis:6379/0', 'production env example points at Compose Redis');
has(
  productionEnvExample,
  'VITE_API_BASE_URL_MODE=same-origin',
  'production env example defaults to same-origin frontend API routing',
);
for (const key of ['VITE_AUTH_API_BASE_URL', 'VITE_USER_API_BASE_URL', 'VITE_ADMIN_API_BASE_URL']) {
  assert.match(
    productionEnvExample,
    new RegExp(`^${key}=$`, 'mu'),
    `production env example actively clears same-origin ${key}`,
  );
}
has(productionEnvExample, 'AUTH_ALLOWED_RETURN_URLS=', 'production env example defines the auth return URL allowlist');
has(
  productionEnvExample,
  'FRONTEND_NGINX_CONFIG=docker/nginx-fullstack.conf',
  'production env example selects same-origin nginx config',
);
for (const [service, variable, port] of [
  ['admin-app', 'ADMIN_APP_PORT', 4200],
  ['user-app', 'USER_APP_PORT', 4201],
  ['landing-app', 'LANDING_APP_PORT', 4202],
  ['mobile-app', 'MOBILE_APP_PORT', 4300],
]) {
  const serviceBlock = section(devCompose, `  ${service}:`, '\n\n  ');
  has(serviceBlock, 'target: 8080', `${service} publishes frontend container port 8080`);
  has(
    serviceBlock,
    `published: '${'${'}${variable}:-${port}}'`,
    `${service} uses explicit published host port ${port}`,
  );
}
const devSiteService = section(devCompose, '  site-app:', '\n\n  mobile-app:');
has(devSiteService, 'target: 80', 'site-app publishes the Vike container port 80');
has(devSiteService, "published: '${SITE_APP_PORT:-4203}'", 'site-app uses its explicit published host port');
has(devSiteService, 'target: site-runtime', 'site-app uses the Vike Docker runtime target');

const prodCompose = read('docker/docker-compose.prod.yml');
const prodBuildCompose = read('docker/docker-compose.prod.build.yml');
const prodRedisCompose = read('docker/docker-compose.prod.redis.yml');

const assertNamedClosureBuilds = (compose, label) => {
  has(compose, 'nrb-closure: ${NRB_CLOSURE_CONTEXT:?', `${label} required named closure context`);
  const buildCount = compose.match(/^    build:$/gmu)?.length ?? 0;
  const namedBuildCount = compose.match(/^      <<: \*nrb-build$/gmu)?.length ?? 0;
  assert.ok(buildCount > 0, `${label} must define Dockerfile builds.`);
  assert.equal(namedBuildCount, buildCount, `${label} has a Dockerfile build without the nrb-closure anchor.`);
};
assertNamedClosureBuilds(devCompose, 'selected Compose');
assertNamedClosureBuilds(prodBuildCompose, 'production source-build Compose');
const prodBundledPostgresCompose = read('docker/docker-compose.prod.bundled-db.yml');
const prodExternalPostgresCompose = read('docker/docker-compose.prod.external-db.yml');
const prodBundledMongoCompose = read('docker/docker-compose.prod.mongodb-bundled-db.yml');
const prodExternalMongoCompose = read('docker/docker-compose.prod.mongodb-external-db.yml');
const prodMongoUsers = read('docker/mongodb/create-production-user.js');
assert.ok(!prodCompose.includes('\n    build:'), 'Production Compose base must only reference published images.');
has(prodBuildCompose, '  admin-app-api:\n    build:', 'production source-build overlay defines backend images');
has(prodBuildCompose, '  mobile-app:\n    build:', 'production source-build overlay defines frontend images');
for (const [service, variable, port, profile] of [
  ['discord-app-api', 'DISCORD_APP_API_PORT', 3007, 'discord'],
  ['telegram-bot-api', 'TELEGRAM_BOT_API_PORT', 3013, 'telegram'],
]) {
  const serviceBlock = section(prodCompose, `  ${service}:`, '\n\n  ');
  has(serviceBlock, `profiles: [${profile}]`, `${service} is opt-in through its production profile`);
  has(serviceBlock, 'target: 80', `${service} production target port 80`);
  has(serviceBlock, `published: '${'${'}${variable}:-${port}}'`, `${service} production host port ${port}`);
  has(serviceBlock, 'host_ip: 127.0.0.1', `${service} production binds published ports to loopback`);
}
has(prodCompose, 'http://127.0.0.1:80/ready', 'prod backend healthcheck targets readiness-aware /ready endpoint');
has(prodCompose, 'su-exec 1000:1000 node -e', 'prod backend healthcheck drops to numeric UID/GID 1000');
assert.ok(
  !prodCompose.includes('http://127.0.0.1:80/health'),
  'Production Compose backend healthcheck must use readiness-aware /ready rather than liveness-only /health.',
);
has(prodCompose, 'http://127.0.0.1:8080/nginx-health', 'prod frontend healthcheck targets container port 8080');
has(prodCompose, 'LANDING_USER_APP_URL: ${LANDING_USER_APP_URL:-}', 'landing receives a runtime user-app destination');
has(
  prodCompose,
  'LANDING_ADMIN_APP_URL: ${LANDING_ADMIN_APP_URL:-}',
  'landing receives a runtime admin-app destination',
);
has(
  prodBuildCompose,
  'NGINX_CONFIG: ${FRONTEND_NGINX_CONFIG:-docker/nginx-fullstack.conf}',
  'production source-build overlay passes selectable frontend nginx config',
);
has(
  prodBuildCompose,
  'VITE_API_BASE_URL_MODE: ${VITE_API_BASE_URL_MODE:-same-origin}',
  'production source-build overlay defaults frontend builds to same-origin API routing',
);
const prodBackendEnv = section(prodCompose, 'x-backend-env:', '\nx-backend-command:');
has(prodBackendEnv, 'PORT: 80', 'production Compose explicitly assigns backend container port 80');
assert.ok(!prodCompose.includes(':-0}'), 'Production Compose must not request random host ports.');
has(prodBackendEnv, 'RATE_LIMIT_STORE: ${RATE_LIMIT_STORE:-auto}', 'production Compose keeps Redis optional');
has(prodBackendEnv, 'REDIS_URL: ${REDIS_URL:-}', 'production Compose has no implicit Redis endpoint');
has(prodRedisCompose, 'RATE_LIMIT_STORE: redis', 'selected Redis overlay forces shared rate limiting');
has(prodRedisCompose, 'REDIS_URL: ${REDIS_URL:-redis://redis:6379/0}', 'selected Redis overlay points APIs at Redis');
has(prodBackendEnv, 'REDIS_KEY_PREFIX: ${REDIS_KEY_PREFIX:-nrb:}', 'production Compose sets Redis key prefix');
has(prodBackendEnv, 'NATS_SERVERS: ${NATS_SERVERS:-}', 'production Compose passes an explicit external NATS endpoint');
has(
  prodBundledPostgresCompose,
  'POSTGRES_POOL_IDLE_TIMEOUT_MS: ${POSTGRES_POOL_IDLE_TIMEOUT_MS:-30000}',
  'production Compose exposes the validated PostgreSQL pool timeout',
);
for (const [label, overlay] of [
  ['bundled PostgreSQL', prodBundledPostgresCompose],
  ['external PostgreSQL', prodExternalPostgresCompose],
]) {
  has(overlay, 'DATABASE_ENGINE: postgres', `${label} overlay selects PostgreSQL`);
  has(overlay, 'AUTH_PERSISTENCE: postgres', `${label} overlay selects PostgreSQL auth persistence`);
  assert.ok(!overlay.includes('DATABASE_ENGINE: mongodb'), `${label} overlay must not select MongoDB.`);
}
has(prodBundledPostgresCompose, '  postgres:', 'bundled PostgreSQL overlay owns the PostgreSQL service');
has(prodBundledPostgresCompose, 'condition: service_healthy', 'bundled PostgreSQL waits for database health');
has(prodExternalPostgresCompose, 'secrets: [database_url]', 'external PostgreSQL uses the database URL secret');
has(
  prodExternalPostgresCompose,
  'file: ${DATABASE_URL_FILE:-./secrets/database_url.txt}',
  'external PostgreSQL reads DATABASE_URL from a secret file',
);
for (const [label, overlay] of [
  ['bundled MongoDB', prodBundledMongoCompose],
  ['external MongoDB', prodExternalMongoCompose],
]) {
  has(overlay, 'DATABASE_ENGINE: mongodb', `${label} overlay selects MongoDB`);
  has(overlay, 'AUTH_PERSISTENCE: mongodb', `${label} overlay selects MongoDB auth persistence`);
  has(overlay, 'MONGODB_REPLICA_SET:', `${label} overlay requires replica-set configuration`);
  assert.ok(!overlay.includes('DATABASE_ENGINE: postgres'), `${label} overlay must not select PostgreSQL.`);
}
has(prodBundledMongoCompose, '  mongodb-init:', 'bundled MongoDB overlay initializes its replica set');
has(
  prodBundledMongoCompose,
  'condition: service_completed_successfully',
  'bundled MongoDB workloads wait for replica-set initialization',
);
has(prodBundledMongoCompose, 'secrets: [mongodb_root_password, mongodb_keyfile]', 'bundled MongoDB uses auth secrets');
has(prodBundledMongoCompose, 'mongodb_migration_password:', 'bundled MongoDB separates migration credentials');
has(
  prodBundledMongoCompose,
  'mongodb_backup_restore_password:',
  'bundled MongoDB separates backup/restore credentials',
);
for (const role of ["'readWrite'", "'dbAdmin'", "'backup'", "'restore'"]) {
  has(prodMongoUsers, `role: ${role}`, `bundled MongoDB principal role ${role}`);
}
has(prodMongoUsers, "actions: ['anyAction']", 'bundled MongoDB oplog replay action privilege');
has(prodMongoUsers, 'anyResource: true', 'bundled MongoDB oplog replay resource privilege');
has(prodExternalMongoCompose, 'secrets: [mongodb_uri]', 'external MongoDB runtime uses its URI secret');
has(prodExternalMongoCompose, 'secrets: [mongodb_migration_uri]', 'external MongoDB migration uses its URI secret');
has(prodExternalMongoCompose, 'mongodb_backup_restore_uri:', 'external MongoDB defines its backup/restore URI secret');
has(
  prodExternalMongoCompose,
  'file: ${MONGODB_URI_FILE:-./secrets/mongodb_uri.txt}',
  'external MongoDB reads MONGODB_URI from a secret file',
);
has(
  prodBackendEnv,
  'AUTH_ALLOWED_RETURN_URLS: ${AUTH_ALLOWED_RETURN_URLS:?set comma-separated allowed auth return URL origins}',
  'production Compose passes the auth return URL allowlist to backend containers',
);
const prodBackendService = section(prodCompose, 'x-backend-service:', '\nx-frontend-service:');
has(
  prodBackendService,
  "user: '0:0'",
  'production Compose elevates only the secret-loading backend entrypoint before it drops privileges',
);
assert.ok(!prodBackendService.includes('redis:'), 'production backends must not depend on unselected Redis.');
has(prodRedisCompose, 'redis:', 'selected Redis overlay adds backend Redis dependencies');
has(
  prodBackendService,
  'condition: service_completed_successfully',
  'production backends wait for selected migrations',
);
has(prodRedisCompose, 'condition: service_healthy', 'selected Redis overlay waits for healthy Redis');
assert.ok(!prodCompose.includes('\n  redis:\n'), 'production base Compose must omit unselected Redis.');
assert.ok(!prodCompose.includes('      redis:\n'), 'production base Compose must not depend on unselected Redis.');
assert.ok(!prodCompose.includes('\n  redis-data:\n'), 'production base Compose must omit the unselected Redis volume.');
assert.ok(
  !prodCompose.includes('\n  redis_password:\n'),
  'production base Compose must omit the unselected Redis secret.',
);
const prodRedisService = section(prodRedisCompose, '  redis:', '\n\n  admin-app-api:');
has(prodRedisService, 'image: redis:7.4.3-alpine', 'production Compose Redis image');
has(prodRedisService, 'redis-server', 'production Compose starts Redis server explicitly');
has(prodRedisService, 'redis-cli', 'production Compose Redis healthcheck command');
has(prodRedisService, 'ping', 'production Compose Redis ping healthcheck');
has(prodRedisCompose, 'redis-data:', 'production Redis overlay persists Redis data volume');

const sharedHealthController = read('libs/backend/common/health/lib/src/base-health.controller.ts');
has(sharedHealthController, "@Get('health')", 'shared health controller exposes /health');
has(
  sharedHealthController,
  "return this.healthService.check('health');",
  'shared /health endpoint delegates to health service',
);
has(sharedHealthController, "@Get('live')", 'shared health controller exposes /live');
has(
  sharedHealthController,
  'return this.healthService.checkLiveness();',
  'shared /live endpoint delegates to liveness checks',
);
has(sharedHealthController, "@Get('ready')", 'shared health controller exposes /ready');
has(
  sharedHealthController,
  'return this.healthService.checkReadiness();',
  'shared /ready endpoint evaluates readiness checks',
);

const healthDecorator = read('libs/backend/common/health/lib/src/decorator/health.decorator.ts');
has(
  healthDecorator,
  'UseInterceptors(HealthTransformInterceptor)',
  'shared health routes install the response-status interceptor',
);
const healthTransformInterceptor = read(
  'libs/backend/common/health/lib/src/interceptor/health-transform.interceptor.ts',
);
has(
  healthTransformInterceptor,
  'response.status(HealthHttpStatus[readHealthStatus(value)]);',
  'shared /ready endpoint preserves the health envelope while setting the fail-closed HTTP status',
);
assert.ok(
  !sharedHealthController.includes('ServiceUnavailableException') &&
    !healthTransformInterceptor.includes('ServiceUnavailableException'),
  'Shared /ready must not discard dependency details through the global Problem Details filter.',
);

for (const { app, healthProvider, modulePath, configPath, localControllerPath } of [
  {
    app: 'auth-app-api',
    healthProvider: 'AuthAppHealthServiceProvider',
    modulePath: 'apps/backend/auth/auth-app-api/src/auth-app-api.module.ts',
    configPath: 'apps/backend/auth/auth-app-api/src/health.config.ts',
    localControllerPath: 'apps/backend/auth/auth-app-api/src/health.controller.ts',
  },
  {
    app: 'user-app-api',
    healthProvider: 'UserAppHealthServiceProvider',
    modulePath: 'apps/backend/user/user-app-api/src/user-app-api.module.ts',
    configPath: 'apps/backend/user/user-app-api/src/health.config.ts',
    localControllerPath: 'apps/backend/user/user-app-api/src/health.controller.ts',
  },
  {
    app: 'admin-app-api',
    healthProvider: 'AdminAppHealthServiceProvider',
    modulePath: 'apps/backend/admin/admin-app-api/src/admin-app-api.module.ts',
    configPath: 'apps/backend/admin/admin-app-api/src/health.config.ts',
    localControllerPath: 'apps/backend/admin/admin-app-api/src/health.controller.ts',
  },
]) {
  assert.ok(
    !existsSync(workspacePath(localControllerPath)),
    `${app} should use the shared BaseHealthController instead of an app-local health.controller.ts`,
  );

  const appModule = read(modulePath);
  has(appModule, 'BaseHealthController', `${app} imports the shared health controller`);
  has(appModule, 'HealthPrivateNetworkIpGuard', `${app} imports the shared health private-network guard`);
  has(appModule, '@app/backend-common-health', `${app} imports shared health wiring from @app/backend-common-health`);
  has(appModule, healthProvider, `${app} imports app-specific health service wiring`);
  has(appModule, './health.config', `${app} imports health.config`);
  assert.match(
    appModule,
    /controllers:\s*\[[^\]]*BaseHealthController[^\]]*\]/,
    `${app} registers the shared health controller`,
  );
  assert.match(
    appModule,
    new RegExp(`providers:\\s*\\[[\\s\\S]*?${healthProvider}[\\s\\S]*?HealthPrivateNetworkIpGuard[\\s\\S]*?\\]`),
    `${app} registers app-specific health provider wiring`,
  );

  const healthConfig = read(configPath);
  has(healthConfig, 'appName:', `${app} health config declares the app name`);
  has(healthConfig, app, `${app} health config sets the expected app name`);
  has(
    healthConfig,
    `export const ${healthProvider}: FactoryProvider<HealthService>`,
    `${app} health config exports its provider-aware HealthService provider`,
  );
  has(healthConfig, 'provide: HealthService', `${app} health config wires HealthService`);
  has(
    healthConfig,
    'DurableDatabaseRuntimeInjectToken',
    `${app} health config receives the selected durable database runtime`,
  );
  has(healthConfig, "runtime.provider === 'mongodb'", `${app} health config normalizes MongoDB transaction readiness`);
  has(healthConfig, "'database-transactions'", `${app} health config names the MongoDB transaction check`);
  has(healthConfig, "'database-migrations'", `${app} health config names the PostgreSQL migration check`);
  has(healthConfig, 'RedisHealthIndicator', `${app} health config includes Redis health wiring`);
  has(healthConfig, 'NatsHealthIndicator', `${app} health config includes NATS health wiring`);
}

for (const [service, variable, port] of [
  ['admin-app', 'ADMIN_APP_PORT', 4200],
  ['user-app', 'USER_APP_PORT', 4201],
  ['landing-app', 'LANDING_APP_PORT', 4202],
  ['mobile-app', 'MOBILE_APP_PORT', 4300],
]) {
  const serviceBlock = section(prodCompose, `  ${service}:`, '\n\n  ');
  has(serviceBlock, 'target: 8080', `${service} production target port 8080`);
  has(
    serviceBlock,
    `published: '${'${'}${variable}:-${port}}'`,
    `${service} production uses explicit host port ${port}`,
  );
  has(serviceBlock, 'host_ip: 127.0.0.1', `${service} production binds published ports to loopback`);
}
const prodSiteService = section(prodCompose, '  site-app:', '\n\n  mobile-app:');
has(prodSiteService, 'target: 80', 'site-app production target port 80');
has(prodSiteService, "published: '${SITE_APP_PORT:-4203}'", 'site-app production uses explicit host port 4203');
const prodSiteBuild = section(prodBuildCompose, '  site-app:', '\n\n  mobile-app:');
has(prodSiteBuild, 'target: site-runtime', 'site-app production source-build uses the Vike Docker runtime target');

const dockerSmoke = read('packages/tooling/src/commands/docker/smoke.ts');
has(dockerSmoke, 'COMPOSE_PROFILES:', 'Docker smoke explicitly selects Compose profiles');
has(dockerSmoke, '...backendServices', 'Docker smoke activates its backend service profiles');
has(dockerSmoke, '...frontendServices', 'Docker smoke activates its frontend service profiles');
has(dockerSmoke, 'async function buildServices', 'Docker smoke retries transient image-build failures');
has(dockerSmoke, '"--parallel",', 'Docker smoke batches image builds through Compose parallel mode');
has(dockerSmoke, 'const composeParallelLimit', 'Docker smoke caps Compose build concurrency');
const fullstackCompose = read('apps/e2e/fullstack/src/compose.ts');
has(fullstackCompose, 'COMPOSE_PROFILES:', 'Full-stack e2e explicitly selects Compose profiles');
has(
  fullstackCompose,
  'readFullstackSelection',
  'Full-stack e2e reads its application and service graph from the selected closure',
);
has(fullstackCompose, '...stackServices', 'Full-stack e2e starts every selected closure service');
has(fullstackCompose, 'DATABASE_ENGINE: databaseProvider', 'Full-stack e2e passes the selected database engine');
has(fullstackCompose, 'DATABASE_URL:', 'Full-stack e2e configures the PostgreSQL connection path');
has(fullstackCompose, 'MONGODB_URI:', 'Full-stack e2e configures the MongoDB connection path');
has(fullstackCompose, 'async function buildServices', 'Full-stack e2e retries transient image-build failures');
has(fullstackCompose, "'compose', '--parallel'", 'Full-stack e2e batches image builds through Compose parallel mode');
has(fullstackCompose, 'const composeParallelLimit', 'Full-stack e2e caps Compose build concurrency');
const smokeSessionSecretDefault = dockerSmoke.match(/SESSION_SECRET:[\s\S]*?\?\?\s*"([^"]+)"/)?.[1];
assert.ok(smokeSessionSecretDefault, 'Docker smoke script must set a SESSION_SECRET default');
assert.ok(
  smokeSessionSecretDefault.length >= 32,
  'Docker smoke SESSION_SECRET default must satisfy the production minimum length.',
);

// Route semantics belong to the one table both edges derive from, not to either rendering of it.
const frontendRoutes = JSON.parse(read('.helm/frontend-routes.json'));
const spaRoutePaths = frontendRoutes.spaRoutes.map((route) => route.path);
const apiLocationsByPrefix = new Map(frontendRoutes.apiLocations.map((location) => [location.prefix, location]));
for (const shadowed of [
  '/admin',
  '/admin/',
  '/admin/dashboard',
  '/admin/dashboard/',
  '/admin/profile',
  '/admin/profile/',
  '/profile',
]) {
  assert.ok(
    spaRoutePaths.includes(shadowed),
    `${shadowed} must be an exact SPA route: an "^~" API prefix skips regex locations, so a regex fallback cannot serve it`,
  );
}
for (const [prefix, app] of [
  ['/auth/', 'auth-app-api'],
  ['/api/auth/', 'auth-app-api'],
  ['/profile/', 'user-app-api'],
  ['/admin/', 'admin-app-api'],
]) {
  assert.equal(apiLocationsByPrefix.get(prefix)?.app, app, `${prefix} must be proxied to ${app}`);
}
assert.equal(
  apiLocationsByPrefix.get('/api/auth/')?.spaFallback,
  undefined,
  'Better Auth owns /api/auth and must never fall through to the SPA navigation fallback',
);

assert.equal(
  read('docker/nginx-fullstack.conf'),
  renderNginxFullstackConfig(frontendRoutes),
  'docker/nginx-fullstack.conf is stale; run node scripts/generate-nginx-config.mjs',
);

const assertNginxRoutes = (text) => {
  has(text, 'listen 8080;', 'frontend nginx listen port');
  has(text, '/nginx-health', 'nginx health route');
  has(text, 'add_header Vary "Accept" always;', 'SPA and API cache entries vary by negotiated media type');
  assert.ok(
    !text.includes('location ~ ^/admin/(dashboard|profile)/?$'),
    'Admin SPA deep links must use exact locations because the ^~ admin API prefix skips regex locations.',
  );
  for (const path of spaRoutePaths) has(text, `location = ${path} {`, `SPA route ${path}`);
  for (const prefix of apiLocationsByPrefix.keys()) has(text, `location ^~ ${prefix} {`, `API prefix ${prefix}`);
  for (const service of ['auth-app-api', 'user-app-api', 'admin-app-api']) {
    has(text, `${service}:80`, `${service} upstream`);
  }
};
assertNginxRoutes(read('docker/nginx-fullstack.conf'));

if (validateHelmStatic) {
  const nginxConfigMap = read('.helm/templates/configmap.yaml');
  has(nginxConfigMap, 'listen {{ default 8080 .Values.frontendNginx.listenPort }};', 'frontend nginx listen port');
  has(nginxConfigMap, '.Values.frontendNginx.healthPath', 'nginx health route');
  has(nginxConfigMap, 'add_header Vary "Accept" always;', 'SPA and API cache entries vary by media type');
  has(nginxConfigMap, '.Files.Get "frontend-routes.json"', 'the chart reads the shared route table');
  has(nginxConfigMap, 'range $route := $routes.spaRoutes', 'the chart iterates the shared SPA routes');
  has(nginxConfigMap, 'range $location := $routes.apiLocations', 'the chart iterates the shared API locations');
  assert.ok(
    !/location \^~ \/(auth|profile|admin)\//u.test(nginxConfigMap),
    'The chart must not restate an API location that the shared route table already declares.',
  );

  const helmValues = read('.helm/values.yaml');
  const helmHelpers = read('.helm/templates/_helpers.tpl');
  const helmConfigMap = read('.helm/templates/configmap.yaml');
  const helmSecret = read('.helm/templates/secret.yaml');
  const helmBackupCronJob = read('.helm/templates/backup-cronjob.yaml');
  const helmPrometheusRule = read('.helm/templates/prometheusrule.yaml');
  const helmDashboard = read('.helm/dashboards/nest-react-boilerplate.json');
  const deploymentTemplate = read('.helm/templates/deployment.yaml');
  const helmValidator = read('scripts/validate-helm.sh');
  const selectedHelmValidation = section(
    helmValidator,
    'echo "==> Helm lint/template (actual selected',
    'echo "==> Helm lint (synthetic PostgreSQL all-reference)"',
  );
  has(selectedHelmValidation, '${PROD_VALUES}', 'Helm validates the actual selected production overlay');
  has(selectedHelmValidation, '${SELECTION_VALUES}', 'Helm validates setup-selected ownership values');
  assert.ok(
    !selectedHelmValidation.includes('backups.enabled=true'),
    'Actual selected Helm validation must not unconditionally enable backups.',
  );
  has(helmValidator, 'POSTGRES_REFERENCE_VALUES', 'Helm keeps synthetic PostgreSQL compatibility values separate');
  has(helmValidator, 'MONGODB_REFERENCE_VALUES', 'Helm keeps synthetic MongoDB compatibility values separate');
  has(helmHelpers, 'list "postgres" "mongodb"', 'Helm accepts PostgreSQL and MongoDB database engines');
  has(helmHelpers, 'database.ownership=external-db only', 'Helm keeps selected databases externally managed');
  has(
    helmHelpers,
    'boilerplate.mongodbPrincipalIdentity',
    'Helm compares MongoDB principals by username and authentication database',
  );
  has(helmHelpers, 'urlParse', 'Helm percent-decodes MongoDB principal identity components');
  has(
    helmHelpers,
    '$runtimeSecret := include "boilerplate.secretName" .',
    'Helm compares the resolved runtime Secret name',
  );
  for (const pair of [
    'resolved runtime and migration Secret names',
    'resolved runtime and backup/restore Secret names',
    'resolved migration and backup/restore Secret names',
  ]) {
    has(helmHelpers, `${pair} must be distinct for MongoDB`, `Helm rejects shared MongoDB Secret names: ${pair}`);
  }
  for (const expected of [
    'percent-encoded-mongodb-principal',
    'generated-runtime-collision',
    'generated-migration-collision',
    'generated-backup-collision',
    'mongodb-generated-runtime.yaml',
    'mongodb-generated-backup.yaml',
  ]) {
    has(helmValidator, expected, `Helm validator covers ${expected}`);
  }
  for (const expected of [
    'DATABASE_ENGINE: {{ $databaseEngine | quote }}',
    '{{- if eq $databaseEngine "postgres" }}',
    'POSTGRES_SYNCHRONIZE:',
    'MONGODB_DATABASE:',
    'MONGODB_REPLICA_SET:',
  ]) {
    has(helmConfigMap, expected, `Helm selected-provider ConfigMap ${expected}`);
  }
  for (const expected of [
    '{{- if eq $databaseEngine "postgres" }}',
    'DATABASE_URL:',
    'MONGODB_URI:',
    'MONGODB_MIGRATION_URI:',
    'MONGODB_BACKUP_RESTORE_URI:',
    'replicaSet URI option',
  ]) {
    has(helmSecret, expected, `Helm selected-provider Secret ${expected}`);
  }
  has(
    helmSecret,
    '(not .Values.migrations.mongodbExistingSecret)',
    'Helm does not render over an external MongoDB migration Secret',
  );
  has(
    helmSecret,
    '(not .Values.backups.mongodb.existingSecret)',
    'Helm does not render over an external MongoDB backup/restore Secret',
  );
  has(
    helmSecret,
    '(not .Values.migrations.mongodbExistingSecret) .Values.secrets.mongodbMigrationUri',
    'Helm compares migration identity only for an in-chart MongoDB migration URI',
  );
  for (const expected of [
    'name: {{ include "boilerplate.fullname" . }}-{{ $databaseEngine }}-backup',
    'pg_dump --format=custom',
    'mongodump --uri "${MONGODB_BACKUP_RESTORE_URI}" --archive="${backup_file}" --gzip --oplog',
  ]) {
    has(helmBackupCronJob, expected, `Helm selected-provider backup ${expected}`);
  }
  has(
    helmPrometheusRule,
    'cronjob="{{ include "boilerplate.fullname" . }}-{{ $databaseEngine }}-backup"',
    'Prometheus backup freshness selector uses the selected database engine',
  );
  has(
    helmPrometheusRule,
    'job_name=~"{{ include "boilerplate.fullname" . }}-{{ $databaseEngine }}-backup.*"',
    'Prometheus failed backup selector uses the selected database engine',
  );
  assert.ok(
    !helmPrometheusRule.includes('PostgreSQL backup'),
    'Prometheus backup alert summaries must remain provider-neutral.',
  );
  has(helmDashboard, '.*-(postgres|mongodb)-backup', 'Grafana backup freshness selector covers both database engines');
  assert.ok(!helmDashboard.includes('postgres-backup'), 'Grafana backup selectors must not be PostgreSQL-only.');
  has(helmValues, 'listenPort: 8080', 'Helm frontend listenPort default');
  for (const expected of [
    'BETTER_AUTH_URL:',
    'BETTER_AUTH_TRUSTED_ORIGINS:',
    'AUTH_ALLOWED_RETURN_URLS:',
    'AUTH_TELEGRAM_ENABLED:',
    'TELEGRAM_TMA_MAX_AGE_SECONDS:',
    'TELEGRAM_OIDC_ENABLED:',
    'TELEGRAM_OIDC_CLIENT_ID:',
    'TELEGRAM_OIDC_SCOPES:',
  ]) {
    has(helmConfigMap, expected, `Helm Telegram/Better Auth ConfigMap ${expected}`);
  }
  for (const expected of ['BETTER_AUTH_SECRET:', 'TELEGRAM_BOT_TOKEN:', 'TELEGRAM_OIDC_CLIENT_SECRET:']) {
    has(helmSecret, expected, `Helm Telegram/Better Auth Secret ${expected}`);
  }
  for (const app of ['authAppApi', 'userAppApi', 'adminAppApi', 'siteApp']) {
    const appBlock = yamlMapEntry(helmValues, app);
    has(appBlock, 'port: 80', `${app} container port`);
    has(appBlock, 'servicePort: 80', `${app} service port`);
  }
  for (const app of ['landingApp', 'userApp', 'adminApp', 'mobileApp']) {
    const appBlock = yamlMapEntry(helmValues, app);
    has(appBlock, 'port: 8080', `${app} container port`);
    has(appBlock, 'servicePort: 80', `${app} service port`);
  }
  const siteHelmBlock = yamlMapEntry(helmValues, 'siteApp');
  has(siteHelmBlock, 'readinessPath: /ready', 'site readiness path');
  has(deploymentTemplate, 'containerPort: {{ $app.port }}', 'Helm deployment uses per-app container port');
  const apiEnvFromBlock = section(
    deploymentTemplate,
    '{{- if or (eq $app.kind "backend") (eq $app.kind "background") }}',
    '{{- if and $root.Values.frontendNginx.enabled $app.nginxConfig }}',
  );
  has(apiEnvFromBlock, 'envFrom:', 'Helm deployment gates backend env on backend processes');
  has(deploymentTemplate, 'secretKeyRef:', 'Helm runtime secrets use explicit key references');
  has(deploymentTemplate, 'key: {{ ternary "DATABASE_URL" "MONGODB_URI"', 'Helm selects only the runtime database key');
  assert.ok(
    !deploymentTemplate.includes('MONGODB_MIGRATION_URI') && !deploymentTemplate.includes('MONGODB_BACKUP_RESTORE_URI'),
    'Helm runtime Deployments must not reference MongoDB migration or backup URI keys.',
  );
  assert.ok(
    !apiEnvFromBlock.includes('- secretRef:'),
    'Helm runtime Deployments must not import every key from the runtime Secret.',
  );
  has(read('.helm/templates/service.yaml'), 'targetPort: http', 'Helm service targets named container port');
  const migrationJobTemplate = read('.helm/templates/migration-job.yaml');
  has(migrationJobTemplate, '.Values.migrations.podSecurityContext', 'Helm migration job renders pod security context');
  has(
    migrationJobTemplate,
    '.Values.migrations.securityContext',
    'Helm migration job renders container security context',
  );
  has(
    migrationJobTemplate,
    'boilerplate.mongodbMigrationSecretName',
    'Helm MongoDB migration job uses a separate principal Secret',
  );
  has(
    helmBackupCronJob,
    'boilerplate.mongodbBackupRestoreSecretName',
    'Helm MongoDB backup uses a separate backup/restore principal Secret',
  );
  for (const expected of [
    'runAsUser: 1000',
    'runAsGroup: 1000',
    'fsGroup: 1000',
    'fsGroupChangePolicy: OnRootMismatch',
  ]) {
    has(helmValues, expected, `Helm backup writable non-root volume context ${expected}`);
  }
  const corootTemplate = read('.helm/templates/coroot.yaml');
  const networkPolicyTemplate = read('.helm/templates/network-policy.yaml');
  const valuesSchema = read('.helm/values.schema.json');
  const liveKubernetesValidator = read('scripts/validate-kubernetes-live.mjs');
  has(corootTemplate, 'if .Values.coroot.rbac.readSecrets', 'Coroot Secret access is an explicit opt-in');
  has(helmValues, 'readSecrets: false', 'Coroot Secret access defaults off');
  for (const expected of [
    'app.kubernetes.io/component: otel-collector',
    'operator: NotIn',
    'port: 4318',
    '.Values.networkPolicy.otelCollector.prometheusNamespace',
    '.Values.networkPolicy.otelCollector.exporterNamespace',
  ]) {
    has(networkPolicyTemplate, expected, `Helm OTEL NetworkPolicy ${expected}`);
  }
  has(deploymentTemplate, 'LANDING_USER_APP_URL', 'Helm landing deployment derives the user-app destination');
  has(deploymentTemplate, 'LANDING_ADMIN_APP_URL', 'Helm landing deployment derives the admin-app destination');
  has(valuesSchema, '"minItems": 1', 'Helm schema requires at least one OTEL exporter port');
  has(valuesSchema, '"maximum": 65535', 'Helm schema bounds OTEL exporter ports');
  has(valuesSchema, '"pattern": "^[a-z0-9]', 'Helm schema validates OTEL namespace selectors');
  for (const expected of [
    "'--dry-run=server'",
    "'--validate=strict'",
    "'--force-conflicts'",
    "'--no-hooks'",
    "'rollout'",
    "'history'",
    'lastSuccessfulTime',
  ]) {
    has(liveKubernetesValidator, expected, `Kubernetes no-deploy validation ${expected}`);
  }

  const productionValues = read('.helm/values-production.yaml');
  has(productionValues, 'readSecrets: false', 'production Coroot Secret access remains disabled');
  const releaseImagePlan = read('scripts/release-image-plan.mjs');
  const setupCatalog = read('packages/tooling/src/setup/catalog.ts');
  const frontendDomainAssignments = [
    ['landingApp', 'landing-app', 'example.com'],
    ['siteApp', 'site-app', 'site-app.example.com'],
    ['userApp', 'user-app', 'user-app.example.com'],
    ['adminApp', 'admin-app', 'admin-app.example.com'],
    ['mobileApp', 'mobile-app', 'mobile-app.example.com'],
  ];
  const coreApiDomainAssignments = [
    ['authAppApi', 'auth-app-api', 'auth-app-api.example.com'],
    ['userAppApi', 'user-app-api', 'user-app-api.example.com'],
    ['adminAppApi', 'admin-app-api', 'admin-app-api.example.com'],
  ];
  const optionalApiDomainAssignments = [
    ['discordAppApi', 'discord-app-api', 'discord-app-api.example.com'],
    ['telegramBotApi', 'telegram-bot-api', 'telegram-bot-api.example.com'],
  ];
  const publicDomainAssignments = [...frontendDomainAssignments, ...coreApiDomainAssignments];
  assert.equal(
    new Set([...publicDomainAssignments, ...optionalApiDomainAssignments].map(([, , host]) => host)).size,
    publicDomainAssignments.length + optionalApiDomainAssignments.length,
    'Every public app contract must have a unique default domain.',
  );
  for (const [app, service] of [...publicDomainAssignments, ...optionalApiDomainAssignments]) {
    has(setupCatalog, `id: '${service}'`, `${app} setup catalog ownership`);
  }
  has(setupCatalog, 'releaseImage:', 'setup catalog owns immutable release image metadata');
  has(releaseImagePlan, 'Object.values(appCatalog)', 'release image plan derives app images from the setup catalog');
  has(setupCatalog, "target: 'site-runtime'", 'setup catalog uses the actual Vike runtime Docker target');
  /**
   * "The release pipeline plans images before it builds them" is a claim about every forge that
   * ships one, so each configured forge's declared release pipeline is read rather than one
   * forge's file. Needles written in GitHub Actions dialect stay behind the jobStyle guard, the
   * way scripts/validate-gitops-config.mjs already does it; their cross-forge half is the
   * `supplyChain` inventory in scripts/ci/gates.json, which check-pipelines.mjs evaluates.
   */
  for (const forge of configuredForges(rootDir)) {
    if (forge.releasePipeline === undefined) {
      releasePipelinesDeferred.push(forge.id);
      continue;
    }
    const releasePipeline = read(forge.releasePipeline);
    releasePipelinesValidated.push(forge.id);
    has(releasePipeline, 'image-plan', `${forge.id} release pipeline selects affected images before build`);
    has(
      releasePipeline,
      'pnpm nrb closure install',
      `${forge.id} release pipeline fails closed and installs a clean selected dependency tree`,
    );
    has(
      releasePipeline,
      'generate-bake-file.mjs --only',
      `${forge.id} release pipeline generates its selected Bake plan`,
    );
    has(
      releasePipeline,
      'docker buildx bake -f docker-bake.json',
      `${forge.id} release pipeline builds through selected Bake only`,
    );
    assert.ok(
      !releasePipeline.includes('docker/build-push-action') && !releasePipeline.includes('target: workspace'),
      `${forge.id} release pipeline must not prime an unscoped direct Docker target`,
    );
    if (forge.jobStyle !== 'github') continue;
    has(
      releasePipeline,
      "VITE_TELEGRAM_AUTH_ENABLED: ${{ vars.VITE_TELEGRAM_AUTH_ENABLED || 'false' }}",
      `${forge.id} release user-app supports an explicit Telegram auth build flag`,
    );
    has(
      releasePipeline,
      'cache-to=type=gha,mode=max,scope=release-',
      `${forge.id} release pipeline persists the shared BuildKit dependency cache for reuse across the bake build`,
    );
  }
  assert.ok(
    releasePipelinesValidated.length > 0,
    `No configured forge declares a release pipeline${
      releasePipelinesDeferred.length > 0 ? ` (${releasePipelinesDeferred.join(', ')} declare none)` : ''
    }; scripts/ci/gates.json must name the pipeline that builds release images.`,
  );
  // The contract lives in the setup catalog, not in this file: `appPublicHostname` is what setup,
  // Compose, and the generated Helm overlay all derive their hostnames from.
  for (const [, service, host] of [...publicDomainAssignments, ...optionalApiDomainAssignments]) {
    assert.equal(
      host,
      appPublicHostname(service, documentedDomain),
      `${service} default domain must match the public domain contract`,
    );
  }
  for (const [label, values] of [
    ['default', helmValues],
    ['production', productionValues],
  ]) {
    const ingressBlock = yamlMapEntry(values, 'ingress', 0);
    const configBlock = yamlMapEntry(values, 'config', 0);
    for (const [app, service, host] of publicDomainAssignments) {
      const appBlock = yamlMapEntry(values, app);
      has(ingressBlock, `host: ${host}`, `${label} ${app} ingress host`);
      has(ingressBlock, `service: ${service}`, `${label} ${app} ingress service`);
      assert.equal(
        ingressBlock.split('\n').filter((line) => line.trim() === `- host: ${host}`).length,
        1,
        `${label} ${app} domain must appear exactly once in ingress rules.`,
      );
      assert.equal(
        ingressBlock.split('\n').filter((line) => line.trim() === `- ${host}`).length,
        1,
        `${label} ${app} domain must appear exactly once in TLS hosts.`,
      );
      if (frontendDomainAssignments.some(([frontendApp]) => frontendApp === app)) {
        has(configBlock, `https://${host}`, `${label} ${app} CORS origin`);
      } else if (label === 'default') {
        has(appBlock, 'kind: backend', `${app} is explicitly classified as a backend app`);
      }
    }

    for (const [app, service, host] of optionalApiDomainAssignments) {
      const appBlock = yamlMapEntry(values, app);
      has(appBlock, 'enabled: false', `${label} ${app} remains opt-in`);
      const hostEntry = section(ingressBlock, `- host: ${host}`, '\n    - host:');
      has(hostEntry, `service: ${service}`, `${label} ${app} optional ingress service`);
      has(hostEntry, 'enabled: false', `${label} ${app} optional ingress is disabled with the app`);
      assert.equal(
        ingressBlock.split('\n').filter((line) => line.trim() === `- ${host}`).length,
        0,
        `${label} ${app} must not request TLS until its optional route is enabled.`,
      );
    }
  }
  for (const app of [
    'authAppApi',
    'userAppApi',
    'adminAppApi',
    'landingApp',
    'siteApp',
    'mobileApp',
    'userApp',
    'adminApp',
  ]) {
    const appBlock = yamlMapEntry(productionValues, app);
    has(appBlock, 'runAsNonRoot: true', `${app} runs as non-root in production values`);
    has(appBlock, 'allowPrivilegeEscalation: false', `${app} disables privilege escalation`);
    hasQ(appBlock, 'capabilities: { drop: ["ALL"] }', `${app} drops Linux capabilities`);
  }
  const migrationValuesBlock = section(productionValues, 'migrations:', '\n\napps:');
  has(migrationValuesBlock, 'runAsNonRoot: true', 'migration job runs as non-root in production values');
  has(migrationValuesBlock, 'runAsUser: 1000', 'migration job uses node user UID in production values');
  has(migrationValuesBlock, 'runAsGroup: 1000', 'migration job uses node group GID in production values');
  has(migrationValuesBlock, 'seccompProfile: { type: RuntimeDefault }', 'migration job uses RuntimeDefault seccomp');
  has(migrationValuesBlock, 'allowPrivilegeEscalation: false', 'migration job disables privilege escalation');
  hasQ(migrationValuesBlock, 'capabilities: { drop: ["ALL"] }', 'migration job drops Linux capabilities');
} else {
  console.log('Helm static deployment assertions skipped for docker mode.');
}

// Repository identity has one source: package.json. A product that renames its repo must not have
// to patch assurance code or operational metadata, so nothing under scripts/ may embed the slug,
// and the files that genuinely cannot read package.json — Prometheus rules — are pinned to it.
const repositorySlug = /github\.com\/(?<slug>[\w.-]+\/[\w.-]+?)(?:\.git)?$/u.exec(
  JSON.parse(read('package.json')).repository.url,
)?.groups?.slug;
assert.ok(repositorySlug, 'package.json must declare a GitHub repository URL');
assert.ok(
  !/github\.com\/[\w.-]+\/[\w.-]+\/security\/advisories/u.test(read('scripts/validate-docker-compose-prod.mjs')),
  'scripts/validate-docker-compose-prod.mjs must derive the repository slug from package.json, not embed it',
);
for (const runbook of read('docker/prometheus/alert-rules.yml').matchAll(
  /runbook_url:\s*'https:\/\/github\.com\/(?<slug>[\w.-]+\/[\w.-]+)\//gu,
)) {
  assert.equal(
    runbook.groups.slug,
    repositorySlug,
    'docker/prometheus/alert-rules.yml runbook links must point at the repository package.json declares',
  );
}

// Docker secrets are enumerated once, in docker/secret-entrypoint.sh. These assertions keep that
// the only enumeration: a second copy of the list inside the entrypoint, an orphan entry, or a new
// application secret that Compose mounts but the entrypoint never loads all fail here.
const secretEntrypointText = read('docker/secret-entrypoint.sh');
const declaredSecrets = parseDeclaredSecrets(secretEntrypointText);
assert.ok(declaredSecrets.length > 0, 'docker/secret-entrypoint.sh must declare at least one secret');
for (const { secret, variable } of declaredSecrets) {
  assert.equal(
    (secretEntrypointText.match(new RegExp(`\\b${secret}\\b`, 'gu')) ?? []).length,
    1,
    `Docker secret "${secret}" is enumerated more than once in docker/secret-entrypoint.sh`,
  );
  assert.match(variable, /^[A-Z][A-Z0-9_]*$/u, `Docker secret "${secret}" must map to an env-var name`);
}
// Secrets consumed by infrastructure containers, which never run the application entrypoint.
const infrastructureOnlySecrets = new Set([
  'grafana_admin_password',
  'mongodb_backup_restore_password',
  'mongodb_backup_restore_uri',
  'mongodb_keyfile',
  'mongodb_root_password',
]);
const declaredSecretNames = new Set(declaredSecrets.map((entry) => entry.secret));
const composeSecretFiles = readdirSync(workspacePath('docker'))
  .filter((name) => name.startsWith('docker-compose') && name.endsWith('.yml'))
  .map((name) => `docker/${name}`);
const composeDeclared = new Set(composeSecretFiles.flatMap((path) => composeDeclaredSecrets(read(path))));
for (const secret of composeSecretFiles.flatMap((path) => composeMountedSecrets(read(path)))) {
  assert.ok(
    declaredSecretNames.has(secret) || infrastructureOnlySecrets.has(secret),
    `Compose mounts Docker secret "${secret}" that docker/secret-entrypoint.sh never loads`,
  );
}
for (const { secret } of declaredSecrets) {
  assert.ok(composeDeclared.has(secret), `docker/secret-entrypoint.sh loads "${secret}" that no Compose file declares`);
}
for (const integration of JSON.parse(read('docker/optional-integrations.json')).integrations) {
  for (const secret of integration.secrets ?? []) {
    assert.ok(
      declaredSecretNames.has(secret),
      `Optional integration "${integration.id}" declares secret "${secret}" that docker/secret-entrypoint.sh never loads`,
    );
  }
}

// The forges are named, not counted: a claim that held for one pipeline and was never evaluated
// for another is the failure this descriptor exists to make visible.
console.log(
  [
    `deployment config static assertions passed (${selectedMode} mode)`,
    `runtime QA fixture validated on: ${runtimeFixtureForges.join(', ')}`,
    ...(validateHelmStatic
      ? [
          `release pipelines validated: ${releasePipelinesValidated.join(', ')}`,
          ...(releasePipelinesDeferred.length > 0
            ? [
                `forges without a declared release pipeline, deferred to ci-pipeline-parity: ${releasePipelinesDeferred.join(', ')}`,
              ]
            : []),
        ]
      : []),
  ].join('; '),
);
