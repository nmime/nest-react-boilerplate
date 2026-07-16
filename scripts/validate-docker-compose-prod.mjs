#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const has = (text, needle, label = needle) =>
  assert.ok(text.includes(needle), `Missing expected Docker Compose production config: ${label}`);

const prodCompose = read('docker/docker-compose.prod.yml');
const bundledDbCompose = read('docker/docker-compose.prod.bundled-db.yml');
const externalDbCompose = read('docker/docker-compose.prod.external-db.yml');
const edgeCompose = read('docker/docker-compose.prod.edge.yml');
const providedTlsCompose = read('docker/docker-compose.prod.edge-provided-tls.yml');
const telegramAuthCompose = read('docker/docker-compose.prod.telegram.yml');
const discordAuthCompose = read('docker/docker-compose.prod.discord.yml');
const singleDomainCaddyfile = read('docker/caddy/Caddyfile.single-domain');
const perAppCaddyfile = read('docker/caddy/Caddyfile.per-app-domains');
const composeWrapper = read('scripts/compose-production.mjs');
const productionEnvExample = read('.env.production.example');
const productionEnv = existsSync(new URL('../.env.production', import.meta.url)) ? read('.env.production') : undefined;
const composeDocs = read('docs/docker-compose-production.md');
const deploymentDocs = read('docs/deployment.md');
const securityPolicy = read('SECURITY.md');

const unsafeTags = new Set(['latest', 'main', 'master', 'dev', 'prod', 'production']);
const placeholderTag = 'sha-000000000000';

const tagFromEnvExample = productionEnvExample.match(/^IMAGE_TAG=(?<tag>.+)$/m)?.groups?.tag.trim();
assert.ok(tagFromEnvExample, '.env.production.example must define IMAGE_TAG');
assert.notEqual(tagFromEnvExample, 'latest', '.env.production.example must not default IMAGE_TAG to latest');
assert.equal(
  tagFromEnvExample,
  placeholderTag,
  '.env.production.example IMAGE_TAG must be the documented non-production sha placeholder',
);

const validateReleaseTag = (tag, label) => {
  assert.ok(tag, `${label} must be set to an immutable sha-<git-sha> image tag`);
  assert.ok(!unsafeTags.has(tag), `${label}=${tag} is mutable/unsafe for production Compose`);
  assert.notEqual(tag, placeholderTag, `${label} still uses the non-production placeholder`);
  assert.match(
    tag,
    /^sha-[0-9a-f]{7,64}$/u,
    `${label} must use sha-<git-sha>, for example sha-$(git rev-parse --short=12 HEAD)`,
  );
};

if (process.env.IMAGE_TAG !== undefined) {
  validateReleaseTag(process.env.IMAGE_TAG.trim(), 'IMAGE_TAG');
}

if (productionEnv !== undefined) {
  const tagFromProductionEnv = productionEnv.match(/^IMAGE_TAG=(?<tag>.+)$/m)?.groups?.tag.trim();
  validateReleaseTag(tagFromProductionEnv, '.env.production IMAGE_TAG');
}

assert.ok(!prodCompose.includes('${IMAGE_TAG:-latest}'), 'production Compose must not default to IMAGE_TAG=latest');
assert.ok(!/^IMAGE_TAG=latest$/m.test(productionEnvExample), 'production env example must not set IMAGE_TAG=latest');
assert.ok(
  !prodCompose.includes('AUTH_JWT_SECRET: ${AUTH_JWT_SECRET'),
  'production Compose must not inline JWT secrets',
);
assert.ok(
  !prodCompose.includes('POSTGRES_PASSWORD: ${POSTGRES_PASSWORD'),
  'production Compose must not inline database passwords',
);
assert.ok(
  !/^AUTH_JWT_SECRET=/m.test(productionEnvExample),
  'production env example must not include inline AUTH_JWT_SECRET',
);
assert.ok(
  !/^POSTGRES_PASSWORD=/m.test(productionEnvExample),
  'production env example must not include inline POSTGRES_PASSWORD',
);
assert.ok(
  !/^DATABASE_URL=postgres:\/\/.*@localhost:/m.test(productionEnvExample),
  'production env example must not set DATABASE_URL to localhost; Compose reads database credentials from secret files.',
);
assert.ok(!prodCompose.includes('\n  postgres:\n'), 'production Compose base must not choose a PostgreSQL topology');
has(bundledDbCompose, '\n  postgres:\n', 'bundled-db overlay defines PostgreSQL');
has(bundledDbCompose, 'postgres_password:', 'bundled-db overlay defines its password secret');
assert.ok(!externalDbCompose.includes('\n  postgres:\n'), 'external-db overlay must not define PostgreSQL');
has(externalDbCompose, 'database_url:', 'external-db overlay defines its URL secret');
has(edgeCompose, 'caddy:2.11.4-alpine', 'Compose-owned Caddy edge image');
has(edgeCompose, 'host_ip: ${EDGE_BIND_ADDRESS:-0.0.0.0}', 'configurable public edge bind address');
has(edgeCompose, "published: '${EDGE_HTTP_PORT:-80}'", 'configurable edge HTTP port');
has(edgeCompose, "published: '${EDGE_HTTPS_PORT:-443}'", 'configurable edge HTTPS port');
has(edgeCompose, 'protocol: udp', 'HTTP/3 UDP listener');
has(edgeCompose, 'cap_drop: [ALL]', 'edge drops capabilities');
has(edgeCompose, 'no-new-privileges:true', 'edge disallows privilege escalation');
has(providedTlsCompose, 'EDGE_TLS_CERT_FILE', 'provided TLS certificate mount');
has(providedTlsCompose, 'EDGE_TLS_KEY_FILE', 'provided TLS key mount');
has(singleDomainCaddyfile, '{$PUBLIC_DOMAIN}', 'single-domain public hostname');
has(singleDomainCaddyfile, '{$PRIMARY_APP_UPSTREAM}', 'single-domain selected apex frontend');
has(perAppCaddyfile, '{$AUTH_APP_API_DOMAIN}', 'per-app auth API hostname');
has(perAppCaddyfile, 'auth-app-api:80', 'per-app auth API upstream');
has(composeWrapper, "'auth-app-api', 'AUTH_APP_API_DOMAIN'", 'app-id domain derivation');
has(composeWrapper, "'landing-app': 'landing-app:8080'", 'landing apex upstream');
has(composeWrapper, "'site-app': 'site-app:80'", 'site apex upstream');
for (const expected of [
  'AUTH_TELEGRAM_ENABLED:',
  'TELEGRAM_OIDC_ENABLED:',
  'TELEGRAM_OIDC_CLIENT_ID:',
  'TELEGRAM_TMA_MAX_AGE_SECONDS:',
  '- telegram_bot_token',
  '- telegram_oidc_client_secret',
]) {
  has(telegramAuthCompose, expected, `Telegram auth overlay ${expected}`);
}
for (const expected of [
  'DISCORD_AUTH_ENABLED:',
  'DISCORD_CLIENT_ID:',
  'DISCORD_REDIRECT_URI:',
  '- discord_client_secret',
]) {
  has(discordAuthCompose, expected, `Discord auth overlay ${expected}`);
}

for (const service of [
  'migrator',
  'admin-app-api',
  'user-app-api',
  'auth-app-api',
  'discord-app-api',
  'telegram-bot-api',
  'admin-app',
  'user-app',
  'landing-app',
  'site-app',
  'mobile-app',
]) {
  has(
    prodCompose,
    `/${service}:${'${IMAGE_TAG:?set IMAGE_TAG to an immutable sha-<git-sha> tag; never use latest}'}`,
    `${service} requires IMAGE_TAG instead of defaulting to latest`,
  );
}

for (const expected of [
  'AUTH_JWT_SECRET_FILE=./secrets/auth_jwt_secret.txt',
  'BETTER_AUTH_SECRET_FILE=./secrets/better_auth_secret.txt',
  'POSTGRES_PASSWORD_FILE=./secrets/postgres_password.txt',
  'DATABASE_URL_FILE=./secrets/database_url.txt',
  'TELEGRAM_BOT_TOKEN_FILE=./secrets/telegram_bot_token.txt',
  'TELEGRAM_OIDC_CLIENT_SECRET_FILE=./secrets/telegram_oidc_client_secret.txt',
  'TELEGRAM_BOT_WEBHOOK_SECRET_FILE=./secrets/telegram_bot_webhook_secret.txt',
  'DISCORD_BOT_TOKEN_FILE=./secrets/discord_bot_token.txt',
  'DISCORD_CLIENT_SECRET_FILE=./secrets/discord_client_secret.txt',
  'DISCORD_PUBLIC_KEY_FILE=./secrets/discord_public_key.txt',
  'IMAGE_TAG=sha-000000000000',
  'PUBLIC_DOMAIN=example.com',
  'PRIMARY_APP=landing-app',
  'COMPOSE_DATABASE_MODE=bundled-db',
  'COMPOSE_DOMAIN_MODE=per-app-domains',
  'COMPOSE_TLS_MODE=automatic',
  'EDGE_BIND_ADDRESS=0.0.0.0',
  'EDGE_HTTP_PORT=80',
  'EDGE_HTTPS_PORT=443',
  'EDGE_TLS_CERT_FILE=./secrets/tls.crt',
  'EDGE_TLS_KEY_FILE=./secrets/tls.key',
  'SITE_APP_PORT=',
  'MOBILE_APP_PORT=',
  'VITE_API_BASE_URL_MODE=same-origin',
  'FRONTEND_NGINX_CONFIG=docker/nginx-fullstack.conf',
  'Never use latest/main/dev/prod-style mutable tags',
]) {
  has(productionEnvExample, expected, `.env.production.example ${expected}`);
}

// Frontend host ports are explicit collision-free defaults; backend API ports use 3001-3003.
// The list below checks that *wrong* legacy defaults (8080-range host ports) are NOT present.
for (const legacyDefault of [
  'ADMIN_APP_PORT:-8081',
  'USER_APP_PORT:-8082',
  'LANDING_APP_PORT:-8080',
  'SITE_APP_PORT:-8084',
  'MOBILE_APP_PORT:-8085',
]) {
  assert.ok(
    !prodCompose.includes(legacyDefault),
    `production Compose must not use legacy 8080-range port default ${legacyDefault}`,
  );
}

// Assert that correct explicit defaults ARE present.
for (const correctDefault of [
  'ADMIN_APP_API_PORT:-3001',
  'USER_APP_API_PORT:-3002',
  'AUTH_APP_API_PORT:-3003',
  'DISCORD_APP_API_PORT:-3007',
  'TELEGRAM_BOT_API_PORT:-3013',
  'ADMIN_APP_PORT:-4200',
  'USER_APP_PORT:-4201',
  'LANDING_APP_PORT:-4202',
  'SITE_APP_PORT:-4203',
  'MOBILE_APP_PORT:-4300',
]) {
  has(prodCompose, correctDefault, `production Compose explicit port default ${correctDefault}`);
}

for (const profile of ['profiles: [discord]', 'profiles: [telegram]']) {
  has(prodCompose, profile, `production Compose optional workload ${profile}`);
}

for (const expected of [
  'NGINX_CONFIG: ${FRONTEND_NGINX_CONFIG:-docker/nginx-fullstack.conf}',
  'VITE_API_BASE_URL_MODE: ${VITE_API_BASE_URL_MODE:-same-origin}',
  'VITE_TELEGRAM_AUTH_ENABLED: ${VITE_TELEGRAM_AUTH_ENABLED:-false}',
]) {
  has(prodCompose, expected, `production Compose frontend build arg ${expected}`);
}

for (const expected of [
  'pnpm run docker:prod:config',
  'pnpm run docker:prod:up',
  'pnpm run docker:prod:bundled-db:config',
  'pnpm run docker:prod:external-db:config',
  'COMPOSE_DOMAIN_MODE=single-domain',
  'COMPOSE_DOMAIN_MODE=per-app-domains',
  'COMPOSE_DOMAIN_MODE=external-proxy',
  'COMPOSE_TLS_MODE=provided',
  'auth-app-api.example.com',
  'wildcard DNS',
  'docker/docker-compose.prod.telegram.yml',
  'docker/docker-compose.prod.discord.yml',
  'user-app.example.com/api/auth/oauth2/callback/telegram',
  'pnpm run docker:prod:config:check',
  'latest',
  'full immutable tag',
  'chmod 600',
]) {
  has(composeDocs, expected, `Docker Compose production docs ${expected}`);
}

has(deploymentDocs, '## Compose production', 'deployment docs production Compose section');
has(deploymentDocs, 'docker:prod:config', 'deployment docs production Compose entrypoint');
has(deploymentDocs, 'single-domain', 'deployment docs single-domain topology');
has(deploymentDocs, 'per-app-domains', 'deployment docs per-app topology');
has(securityPolicy, 'security@example.com', 'security contact placeholder');
has(securityPolicy, 'within 3 business days', 'security acknowledgement SLA');
has(securityPolicy, 'within 5 business days', 'security triage SLA');

console.log(
  JSON.stringify({
    status: 'ok',
    checked: 'docker-compose-production',
    imageTag: tagFromEnvExample,
  }),
);
