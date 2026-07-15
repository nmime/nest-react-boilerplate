#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const has = (text, needle, label = needle) =>
  assert.ok(text.includes(needle), `Missing expected Docker Compose production config: ${label}`);

const prodCompose = read('docker/docker-compose.prod.yml');
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
  'production env example must not set DATABASE_URL to localhost; leave it blank so Compose builds the in-network URL from secrets.',
);

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
  'POSTGRES_PASSWORD_FILE=./secrets/postgres_password.txt',
  'TELEGRAM_BOT_TOKEN_FILE=./secrets/telegram_bot_token.txt',
  'TELEGRAM_BOT_WEBHOOK_SECRET_FILE=./secrets/telegram_bot_webhook_secret.txt',
  'DISCORD_BOT_TOKEN_FILE=./secrets/discord_bot_token.txt',
  'DISCORD_PUBLIC_KEY_FILE=./secrets/discord_public_key.txt',
  'IMAGE_TAG=sha-000000000000',
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
]) {
  has(prodCompose, expected, `production Compose frontend build arg ${expected}`);
}

for (const expected of [
  'docker compose --env-file .env.production -f docker/docker-compose.prod.yml config',
  'node scripts/validate-docker-compose-prod.mjs',
  'latest',
  'sha-<git-sha>',
  'chmod 600',
]) {
  has(composeDocs, expected, `Docker Compose production docs ${expected}`);
}

has(deploymentDocs, 'Docker Compose production readiness', 'deployment docs production Compose readiness section');
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
