import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const has = (text, needle, label = needle) =>
  assert.ok(text.includes(needle), `Missing expected deployment config: ${label}`);
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
has(dockerfile, 'FROM nginxinc/nginx-unprivileged:1.31.1-alpine AS frontend', 'unprivileged frontend base image');
has(dockerfile, 'COPY docker/nginx-fullstack.conf /etc/nginx/conf.d/default.conf', 'frontend nginx config copy');
has(dockerfile, 'USER 101', 'frontend runtime user 101');
has(dockerfile, 'EXPOSE 8080', 'frontend exposes unprivileged port 8080');
const migratorStage = section(dockerfile, 'FROM workspace AS migrator', 'FROM workspace AS prod-deps');
has(migratorStage, 'USER node', 'migrator runs as the non-root node user');
before(migratorStage, 'USER node', 'CMD ["pnpm", "db:migrate"]', 'migrator USER node before db:migrate command');

const devCompose = read('docker/docker-compose.yml');
has(devCompose, 'http://127.0.0.1:8080/nginx-health', 'dev frontend healthcheck targets container port 8080');
has(devCompose, `${'${'}ADMIN_APP_API_PORT:-3001}:3000`, 'admin API port variable');
const devBackendEnv = section(devCompose, 'x-backend-env:', '\nx-backend-healthcheck:');
has(devBackendEnv, 'NODE_ENV: ${NODE_ENV:-development}', 'dev Compose backend defaults to development NODE_ENV');
has(devBackendEnv, 'AUTH_JWT_SECRET: ${AUTH_JWT_SECRET:-dev-secret}', 'dev Compose uses an intentionally short dev JWT default');
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
has(
  productionEnvExample,
  'AUTH_JWT_SECRET_FILE=./secrets/auth_jwt_secret.txt',
  'production env example reads JWT secret from a Docker secret file',
);
assert.ok(
  !/^AUTH_JWT_SECRET=/m.test(productionEnvExample),
  'Production env example must not provide an inline JWT secret placeholder.',
);
has(productionEnvExample, 'RATE_LIMIT_STORE=redis', 'production env example forces shared Redis rate limiting');
has(productionEnvExample, 'REDIS_URL=redis://redis:6379/0', 'production env example points at Compose Redis');
for (const [service, variable] of [
  ['admin-app', 'ADMIN_APP_PORT:-8081'],
  ['user-app', 'USER_APP_PORT:-8082'],
  ['landing-app', 'LANDING_APP_PORT:-8083'],
]) {
  has(devCompose, `${'${'}${variable}}:8080`, `${service} maps to frontend container port 8080`);
}

const prodCompose = read('docker/docker-compose.prod.yml');
has(prodCompose, 'http://127.0.0.1:8080/nginx-health', 'prod frontend healthcheck targets container port 8080');
const prodBackendEnv = section(prodCompose, 'x-backend-env:', '\nx-backend-command:');
has(prodBackendEnv, 'RATE_LIMIT_STORE: ${RATE_LIMIT_STORE:-redis}', 'production Compose defaults to Redis rate limiting');
has(prodBackendEnv, 'REDIS_URL: ${REDIS_URL:-redis://redis:6379/0}', 'production Compose points APIs at Redis');
has(prodBackendEnv, 'REDIS_KEY_PREFIX: ${REDIS_KEY_PREFIX:-nrb:}', 'production Compose sets Redis key prefix');
const prodBackendService = section(prodCompose, 'x-backend-service:', '\nx-frontend-service:');
has(prodBackendService, 'redis:', 'production backend services depend on Redis');
has(prodBackendService, 'condition: service_healthy', 'production backend services wait for healthy dependencies');
const prodRedisService = section(prodCompose, '  redis:', '\n\n  migrate:');
has(prodRedisService, 'image: redis:7-alpine', 'production Compose Redis image');
has(prodRedisService, 'redis-server', 'production Compose starts Redis server explicitly');
has(prodRedisService, 'redis-cli', 'production Compose Redis healthcheck command');
has(prodRedisService, 'ping', 'production Compose Redis ping healthcheck');
has(prodCompose, 'redis-data:', 'production Compose persists Redis data volume');
for (const [service, variable] of [
  ['admin-app', 'ADMIN_APP_PORT:-8081'],
  ['user-app', 'USER_APP_PORT:-8082'],
  ['landing-app', 'LANDING_APP_PORT:-8080'],
]) {
  const serviceBlock = section(prodCompose, `  ${service}:`, '\n\n  ');
  has(serviceBlock, `127.0.0.1:${'${'}${variable}}:8080`, `${service} production host mapping targets container port 8080`);
  assert.ok(!serviceBlock.includes(`127.0.0.1:${'${'}${variable}}:80"`), `${service} must not target privileged container port 80`);
}

const dockerSmoke = read('packages/tooling/scripts/docker/smoke.mjs');
const smokeJwtSecretDefault = dockerSmoke.match(/AUTH_JWT_SECRET:[\s\S]*?\?\?\s*"([^"]+)"/)?.[1];
assert.ok(smokeJwtSecretDefault, 'Docker smoke script must set an AUTH_JWT_SECRET default');
assert.ok(
  smokeJwtSecretDefault.length >= 32,
  'Docker smoke AUTH_JWT_SECRET default must satisfy the production minimum length.',
);

const assertNginxRoutes = (text, { helm = false } = {}) => {
  has(text, helm ? 'listen {{ default 8080 .Values.frontendNginx.listenPort }};' : 'listen 8080;', 'frontend nginx listen port');
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
  before(text, 'location = /profile {', 'location ^~ /profile/ {', 'exact /profile SPA route precedes profile API prefix');
  has(text, 'location ^~ /auth/', 'auth API prefix route cannot be shadowed by regex static assets');
  has(text, 'location ^~ /profile/', 'profile/user API prefix route cannot be shadowed by regex static assets');
  has(text, 'location ^~ /admin/', 'admin API prefix route cannot be shadowed by regex static assets');
  has(text, helm ? '-admin-api:' : 'backend-admin-app-api:3000', 'admin API upstream');
};
assertNginxRoutes(read('docker/nginx-fullstack.conf'));
assertNginxRoutes(read('.helm/templates/configmap.yaml'), { helm: true });

const helmValues = read('.helm/values.yaml');
has(helmValues, 'listenPort: 8080', 'Helm frontend listenPort default');
for (const app of ['landing', 'userFrontend', 'adminFrontend']) {
  const appBlock = yamlMapEntry(helmValues, app);
  has(appBlock, 'port: 8080', `${app} container port`);
  has(appBlock, 'servicePort: 80', `${app} service port`);
}
const deploymentTemplate = read('.helm/templates/deployment.yaml');
has(deploymentTemplate, 'containerPort: {{ $app.port }}', 'Helm deployment uses per-app container port');
const apiEnvFromBlock = section(
  deploymentTemplate,
  '{{- if contains "Api" $name }}',
  '{{- if and $root.Values.frontendNginx.enabled $app.nginxConfig }}',
);
has(apiEnvFromBlock, 'envFrom:', 'Helm deployment gates backend env on API apps');
has(apiEnvFromBlock, 'secretRef:', 'Helm deployment gates backend secrets on API apps');
has(read('.helm/templates/service.yaml'), 'targetPort: http', 'Helm service targets named container port');
const migrationJobTemplate = read('.helm/templates/migration-job.yaml');
has(migrationJobTemplate, '.Values.migrations.podSecurityContext', 'Helm migration job renders pod security context');
has(migrationJobTemplate, '.Values.migrations.securityContext', 'Helm migration job renders container security context');

const productionValues = read('.helm/values-production.yaml');
for (const app of ['authApi', 'userApi', 'adminApi', 'landing', 'userFrontend', 'adminFrontend']) {
  const appBlock = yamlMapEntry(productionValues, app);
  has(appBlock, 'runAsNonRoot: true', `${app} runs as non-root in production values`);
  has(appBlock, 'allowPrivilegeEscalation: false', `${app} disables privilege escalation`);
  has(appBlock, 'capabilities: { drop: ["ALL"] }', `${app} drops Linux capabilities`);
}
const migrationValuesBlock = section(productionValues, 'migrations:', '\n\napps:');
has(migrationValuesBlock, 'runAsNonRoot: true', 'migration job runs as non-root in production values');
has(migrationValuesBlock, 'runAsUser: 1000', 'migration job uses node user UID in production values');
has(migrationValuesBlock, 'runAsGroup: 1000', 'migration job uses node group GID in production values');
has(migrationValuesBlock, 'seccompProfile: { type: RuntimeDefault }', 'migration job uses RuntimeDefault seccomp');
has(migrationValuesBlock, 'allowPrivilegeEscalation: false', 'migration job disables privilege escalation');
has(migrationValuesBlock, 'capabilities: { drop: ["ALL"] }', 'migration job drops Linux capabilities');

console.log('deployment config static assertions passed');
