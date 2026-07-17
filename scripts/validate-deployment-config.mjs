import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
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
const rootPackageJson = JSON.parse(read('package.json'));
const pinnedPnpm = rootPackageJson.packageManager?.split('@')[1];
assert.ok(pinnedPnpm, 'package.json packageManager must pin a pnpm version');
has(dockerfile, `ARG PNPM_VERSION=${pinnedPnpm}`, `Dockerfile pnpm version must match packageManager (${pinnedPnpm})`);
has(dockerfile, 'FROM nginxinc/nginx-unprivileged:1.31.2-alpine AS frontend', 'unprivileged frontend base image');
has(dockerfile, 'ARG NX_TARGET=build', 'Dockerfile builder supports non-build frontend targets such as mobile export');
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
const ciWorkflow = read('.github/workflows/ci.yml');
const runtimeOpsJob = section(ciWorkflow, '  ops-gates:', '  fullstack-e2e:');
for (const expected of [
  "AUTH_TELEGRAM_ENABLED: 'true'",
  "TELEGRAM_BOT_TOKEN: '123456789:test-bot-token'",
  "VITE_TELEGRAM_AUTH_ENABLED: 'true'",
]) {
  has(runtimeOpsJob, expected, `runtime QA Telegram TMA fixture ${expected}`);
}
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
has(
  migratorStage,
  'ENTRYPOINT ["/usr/local/bin/secret-entrypoint"]',
  'migrator loads file secrets and drops privileges through the shared entrypoint',
);
before(
  migratorStage,
  'ENTRYPOINT ["/usr/local/bin/secret-entrypoint"]',
  'CMD ["pnpm", "db:migrate"]',
  'migrator entrypoint before db:migrate command',
);

// Backend images ship per-app production dependencies computed from each app's
// generated dist package.json + pruned lockfile, not the whole-workspace tree.
const backendDepsStage = section(dockerfile, 'FROM builder AS backend-deps', 'FROM node:${NODE_VERSION} AS backend');
has(
  backendDepsStage,
  'pnpm install --prod --prefer-offline --ignore-workspace --no-frozen-lockfile --ignore-scripts',
  'backend-deps installs per-app prod dependencies from the fetched store with registry metadata fallback',
);
has(
  backendDepsStage,
  'WORKDIR /workspace/${BUILD_OUTPUT}',
  "backend-deps installs against the app's generated dist package.json",
);
const backendStage = section(dockerfile, 'FROM node:${NODE_VERSION} AS backend', 'FROM nginxinc/nginx-unprivileged');
has(
  backendStage,
  'COPY --from=backend-deps /workspace/${BUILD_OUTPUT}/node_modules ./node_modules',
  'backend copies the per-app pruned node_modules to a shared /app ancestor',
);
has(
  backendStage,
  'COPY --from=backend-deps /workspace/${BUILD_OUTPUT}/package.json ./package.json',
  "backend copies the app's generated package.json alongside its node_modules",
);
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
has(siteStage, 'COPY --from=builder /workspace/dist ./dist', 'site runtime copies built Vike output');
has(siteStage, 'USER node', 'site runtime runs as the non-root node user');
has(siteStage, 'EXPOSE 80', 'site runtime exposes the Vike server port');

const devCompose = read('docker/docker-compose.yml');
has(devCompose, 'http://127.0.0.1:8080/nginx-health', 'dev frontend healthcheck targets container port 8080');
has(devCompose, "published: '${ADMIN_APP_API_PORT:-3001}'", 'admin API explicit published port assignment');
assert.ok(!devCompose.includes(':-0}'), 'Development Compose must not request random host ports.');
const devBackendEnv = section(devCompose, 'x-backend-env:', '\nx-backend-healthcheck:');
has(devBackendEnv, 'NODE_ENV: ${NODE_ENV:-development}', 'dev Compose backend defaults to development NODE_ENV');
has(devBackendEnv, 'PORT: 80', 'dev Compose explicitly assigns backend container port 80');
has(
  devBackendEnv,
  'DATABASE_URL: ${CONTAINER_DATABASE_URL:-postgres://postgres:postgres@postgres:5432/nest_react_boilerplate}',
  'dev Compose keeps container DATABASE_URL on the Compose network',
);
assert.ok(
  !devBackendEnv.includes('DATABASE_URL: ${DATABASE_URL:-'),
  'Local Docker services must not inherit host DATABASE_URL; CI uses localhost for host-side QA tools.',
);
has(
  devBackendEnv,
  'AUTH_JWT_SECRET: ${AUTH_JWT_SECRET:-dev-secret}',
  'dev Compose uses an intentionally short dev JWT default',
);
const jwtSecretDefault = devBackendEnv.match(/AUTH_JWT_SECRET:\s*\$\{AUTH_JWT_SECRET:-([^}]+)\}/)?.[1];
assert.ok(jwtSecretDefault, 'Missing local Docker AUTH_JWT_SECRET default');
assert.ok(
  jwtSecretDefault.trim().length < 32,
  'Local Docker AUTH_JWT_SECRET default must fail the production minimum length.',
);
const envExample = read('.env.example');
const envExampleJwtSecret = envExample.match(/^AUTH_JWT_SECRET=(.+)$/m)?.[1];
assert.ok(envExampleJwtSecret, 'Missing .env.example AUTH_JWT_SECRET placeholder');
assert.ok(
  envExampleJwtSecret.trim().length < 32,
  '.env.example AUTH_JWT_SECRET placeholder must fail the production minimum length.',
);
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
has(
  productionEnvExample,
  'AUTH_JWT_SECRET_FILE=./secrets/auth_jwt_secret.txt',
  'production env example reads JWT secret from a Docker secret file',
);
for (const expected of [
  'SESSION_SECRET_FILE=./secrets/session_secret.txt',
  'AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY_FILE=./secrets/auth_provider_token_encryption_key.txt',
  'REDIS_PASSWORD_FILE=./secrets/redis_password.txt',
]) {
  has(productionEnvExample, expected, `production env example reads ${expected} from a Docker secret file`);
}
assert.ok(
  !/^AUTH_JWT_SECRET=/m.test(productionEnvExample),
  'Production env example must not provide an inline JWT secret placeholder.',
);
has(productionEnvExample, 'RATE_LIMIT_STORE=redis', 'production env example forces shared Redis rate limiting');
has(productionEnvExample, 'REDIS_URL=redis://redis:6379/0', 'production env example points at Compose Redis');
has(
  productionEnvExample,
  'VITE_API_BASE_URL_MODE=same-origin',
  'production env example defaults to same-origin frontend API routing',
);
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
assert.ok(
  !prodCompose.includes('http://127.0.0.1:80/health'),
  'Production Compose backend healthcheck must use readiness-aware /ready rather than liveness-only /health.',
);
has(prodCompose, 'http://127.0.0.1:8080/nginx-health', 'prod frontend healthcheck targets container port 8080');
has(
  prodCompose,
  'NGINX_CONFIG: ${FRONTEND_NGINX_CONFIG:-docker/nginx-fullstack.conf}',
  'production Compose passes selectable frontend nginx config',
);
has(
  prodCompose,
  'VITE_API_BASE_URL_MODE: ${VITE_API_BASE_URL_MODE:-same-origin}',
  'production Compose defaults frontend builds to same-origin API routing',
);
const prodBackendEnv = section(prodCompose, 'x-backend-env:', '\nx-backend-command:');
has(prodBackendEnv, 'PORT: 80', 'production Compose explicitly assigns backend container port 80');
assert.ok(!prodCompose.includes(':-0}'), 'Production Compose must not request random host ports.');
has(
  prodBackendEnv,
  'RATE_LIMIT_STORE: ${RATE_LIMIT_STORE:-redis}',
  'production Compose defaults to Redis rate limiting',
);
has(prodBackendEnv, 'REDIS_URL: ${REDIS_URL:-redis://redis:6379/0}', 'production Compose points APIs at Redis');
has(prodBackendEnv, 'REDIS_KEY_PREFIX: ${REDIS_KEY_PREFIX:-nrb:}', 'production Compose sets Redis key prefix');
const prodBackendService = section(prodCompose, 'x-backend-service:', '\nx-frontend-service:');
has(prodBackendService, 'redis:', 'production backend services depend on Redis');
has(prodBackendService, 'condition: service_healthy', 'production backend services wait for healthy dependencies');
const prodRedisService = section(prodCompose, '  redis:', '\n\n  migrate:');
has(prodRedisService, 'image: redis:7.4.3-alpine', 'production Compose Redis image');
has(prodRedisService, 'redis-server', 'production Compose starts Redis server explicitly');
has(prodRedisService, 'redis-cli', 'production Compose Redis healthcheck command');
has(prodRedisService, 'ping', 'production Compose Redis ping healthcheck');
has(prodCompose, 'redis-data:', 'production Compose persists Redis data volume');

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
  'await this.healthService.checkReadiness();',
  'shared /ready endpoint evaluates readiness checks',
);
has(
  sharedHealthController,
  'ServiceUnavailableException',
  'shared /ready endpoint fails closed when required dependencies are unavailable',
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
    !existsSync(new URL(`../${localControllerPath}`, import.meta.url)),
    `${app} should use the shared BaseHealthController instead of an app-local health.controller.ts`,
  );

  const appModule = read(modulePath);
  has(appModule, 'BaseHealthController', `${app} imports the shared health controller`);
  has(appModule, 'HealthPrivateNetworkIpGuard', `${app} imports the shared health private-network guard`);
  has(appModule, '@app/backend-common-health', `${app} imports shared health wiring from @app/backend-common-health`);
  has(appModule, healthProvider, `${app} imports app-specific health service wiring`);
  has(appModule, './health.config', `${app} imports health.config`);
  has(appModule, 'controllers: [BaseHealthController]', `${app} registers the shared health controller`);
  has(
    appModule,
    `providers: [${healthProvider}, HealthPrivateNetworkIpGuard]`,
    `${app} registers app-specific health provider wiring`,
  );

  const healthConfig = read(configPath);
  has(healthConfig, 'const appName =', `${app} health config declares the app name`);
  has(healthConfig, app, `${app} health config sets the expected app name`);
  has(
    healthConfig,
    `export const ${healthProvider}: Provider`,
    `${app} health config exports the app-specific HealthService provider`,
  );
  has(healthConfig, 'provide: HealthService', `${app} health config wires HealthService`);
  has(healthConfig, 'new PostgresReadinessHealthIndicator', `${app} /ready includes PostgreSQL readiness checks`);
  has(
    healthConfig,
    'new PostgresMigrationsHealthIndicator',
    `${app} health config includes PostgreSQL migration checks`,
  );
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
has(prodSiteService, 'target: site-runtime', 'site-app production build uses the Vike Docker runtime target');

const dockerSmoke = read('packages/tooling/src/commands/docker/smoke.ts');
has(
  dockerSmoke,
  "['postgres', ...backendServices, ...frontendServices].join(',')",
  'Docker smoke activates every dependency profile used by the tested stack',
);
has(dockerSmoke, 'async function buildService', 'Docker smoke retries transient image-build failures');
const fullstackCompose = read('apps/e2e/fullstack/src/compose.ts');
has(
  fullstackCompose,
  "['postgres', ...stackServices.filter((service) => service !== 'migrate')].join(',')",
  'Full-stack e2e activates every dependency profile used by its tested stack',
);
has(fullstackCompose, 'async function buildService', 'Full-stack e2e retries transient image-build failures');
const smokeJwtSecretDefault = dockerSmoke.match(/AUTH_JWT_SECRET:[\s\S]*?\?\?\s*"([^"]+)"/)?.[1];
assert.ok(smokeJwtSecretDefault, 'Docker smoke script must set an AUTH_JWT_SECRET default');
assert.ok(
  smokeJwtSecretDefault.length >= 32,
  'Docker smoke AUTH_JWT_SECRET default must satisfy the production minimum length.',
);

const assertNginxRoutes = (text, { helm = false } = {}) => {
  has(
    text,
    helm ? 'listen {{ default 8080 .Values.frontendNginx.listenPort }};' : 'listen 8080;',
    'frontend nginx listen port',
  );
  has(text, helm ? '.Values.frontendNginx.healthPath' : '/nginx-health', 'nginx health route');
  before(text, 'location = /admin {', 'location ^~ /admin/ {', 'exact /admin SPA route precedes /admin API prefix');
  before(text, 'location = /admin/ {', 'location ^~ /admin/ {', 'exact /admin/ SPA route precedes /admin API prefix');
  for (const adminSpaRoute of ['dashboard', 'dashboard/', 'profile', 'profile/']) {
    before(
      text,
      `location = /admin/${adminSpaRoute} {`,
      'location ^~ /admin/ {',
      `exact /admin/${adminSpaRoute} SPA route wins over admin API prefix`,
    );
  }
  assert.ok(
    !text.includes('location ~ ^/admin/(dashboard|profile)/?$'),
    'Admin SPA deep links must use exact locations because the ^~ admin API prefix skips regex locations.',
  );
  before(
    text,
    'location = /profile {',
    'location ^~ /profile/ {',
    'exact /profile SPA route precedes profile API prefix',
  );
  has(text, 'location ^~ /auth/', 'auth API prefix route cannot be shadowed by regex static assets');
  has(text, 'location ^~ /api/auth/', 'Better Auth API prefix must be proxied to auth-app-api');
  has(text, 'location ^~ /profile/', 'profile/user API prefix route cannot be shadowed by regex static assets');
  has(text, 'location ^~ /admin/', 'admin API prefix route cannot be shadowed by regex static assets');
  for (const service of ['auth-app-api', 'user-app-api', 'admin-app-api']) {
    has(text, helm ? `-${service}:` : `${service}:80`, `${service} upstream`);
  }
};
assertNginxRoutes(read('docker/nginx-fullstack.conf'));

if (validateHelmStatic) {
  assertNginxRoutes(read('.helm/templates/configmap.yaml'), { helm: true });

  const helmValues = read('.helm/values.yaml');
  const helmConfigMap = read('.helm/templates/configmap.yaml');
  const helmSecret = read('.helm/templates/secret.yaml');
  has(helmValues, 'listenPort: 8080', 'Helm frontend listenPort default');
  for (const expected of [
    'BETTER_AUTH_URL:',
    'BETTER_AUTH_TRUSTED_ORIGINS:',
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
  const deploymentTemplate = read('.helm/templates/deployment.yaml');
  has(deploymentTemplate, 'containerPort: {{ $app.port }}', 'Helm deployment uses per-app container port');
  const apiEnvFromBlock = section(
    deploymentTemplate,
    '{{- if eq $app.kind "backend" }}',
    '{{- if and $root.Values.frontendNginx.enabled $app.nginxConfig }}',
  );
  has(apiEnvFromBlock, 'envFrom:', 'Helm deployment gates backend env on API apps');
  has(apiEnvFromBlock, 'secretRef:', 'Helm deployment gates backend secrets on API apps');
  has(read('.helm/templates/service.yaml'), 'targetPort: http', 'Helm service targets named container port');
  const migrationJobTemplate = read('.helm/templates/migration-job.yaml');
  has(migrationJobTemplate, '.Values.migrations.podSecurityContext', 'Helm migration job renders pod security context');
  has(
    migrationJobTemplate,
    '.Values.migrations.securityContext',
    'Helm migration job renders container security context',
  );

  const productionValues = read('.helm/values-production.yaml');
  const releaseWorkflow = read('.github/workflows/release-images.yml');
  has(
    releaseWorkflow,
    "VITE_TELEGRAM_AUTH_ENABLED=${{ vars.VITE_TELEGRAM_AUTH_ENABLED || 'false' }}",
    'release user-app supports an explicit Telegram auth build flag',
  );
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
    has(releaseWorkflow, `- name: ${service}`, `${app} immutable release image`);
    has(releaseWorkflow, `NX_PROJECT=${service}`, `${app} release workflow Nx project`);
  }
  for (const [, service, host] of [...publicDomainAssignments, ...optionalApiDomainAssignments]) {
    const expectedHost = service === 'landing-app' ? 'example.com' : `${service}.example.com`;
    assert.equal(host, expectedHost, `${service} default domain must match the public domain contract`);
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

console.log(`deployment config static assertions passed (${selectedMode} mode)`);
