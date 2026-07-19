#!/usr/bin/env node
import assert from 'node:assert/strict';
import { accessSync, constants, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(rootDir, path), 'utf8');
const packageJson = JSON.parse(read('package.json'));
const serverExample = read('deploy/single-server/server.env.example');
const productionExample = read('deploy/single-server/production.env.example');
const fullProductionExample = read('.env.production.example');
const controller = read('deploy/single-server/serverctl');
const bootstrap = read('deploy/single-server/bootstrap.sh');
const renderer = read('scripts/single-server-deployment.mjs');
const docs = read('docs/single-server-deployment.md');
const externalProxyModeContract = ['EXTERNAL_PROXY_PUBLIC_MODE', 'per-app-domains'].join('=');

const value = (content, key) => content.match(new RegExp(`^${key}=(.+)$`, 'mu'))?.[1];
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: rootDir, encoding: 'utf8' });
  assert.equal(result.status, 0, `${command} ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
};

for (const path of ['deploy/single-server/serverctl', 'deploy/single-server/bootstrap.sh']) {
  accessSync(join(rootDir, path), constants.X_OK);
  assert.ok(statSync(join(rootDir, path)).isFile(), `${path} must be an executable file`);
}

assert.equal(value(serverExample, 'NODE_VERSION')?.split('.')[0], '24');
assert.equal(value(serverExample, 'PNPM_VERSION'), packageJson.packageManager.split('@')[1]);
assert.equal(packageJson.engines.node, '>=24 <25');
assert.equal(packageJson.engines.pnpm, value(serverExample, 'PNPM_VERSION'));

for (const contract of [
  'COMPOSE_DOMAIN_MODE=external-proxy',
  'COMPOSE_TLS_MODE=external',
  externalProxyModeContract,
  'VITE_API_BASE_URL_MODE=same-origin',
  'VITE_AUTH_API_BASE_URL=',
  'VITE_USER_API_BASE_URL=',
  'VITE_ADMIN_API_BASE_URL=',
]) {
  assert.ok(productionExample.includes(contract), `host production example missing ${contract}`);
}
assert.ok(fullProductionExample.includes(externalProxyModeContract));

for (const command of [
  'init',
  'provision',
  'apply',
  'deploy',
  'update',
  'rollback',
  'renew',
  'doctor',
  'status',
  'logs',
]) {
  assert.match(controller, new RegExp(`\\b${command}\\b`, 'u'), `controller missing ${command}`);
}
for (const requirement of [
  'download.docker.com/linux',
  'apt_install ca-certificates certbot',
  'nodejs.org/dist/v${NODE_VERSION}',
  'sha256sum --check --strict',
  'corepack install --global',
  'pnpm@${PNPM_VERSION}',
  'certbot.timer',
  'nginx -t',
  'merge --ff-only',
  '--wait-timeout=300',
  '--renew-with-new-domains',
  '--resolve "${host}:443:127.0.0.1"',
  'prepare_runtime_permissions',
  'must be empty in same-origin mode',
  'openssl x509 -in "${certificate}" -noout -checkhost',
  'check_compose_health',
  'current-image-tag',
  'previous-image-tag',
  'configure_secret SESSION_SECRET_FILE session_secret.txt hex',
  'configure_secret AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY_FILE auth_provider_token_encryption_key.txt base64-32',
  'configure_secret REDIS_PASSWORD_FILE redis_password.txt hex',
  'configure_secret TELEGRAM_BOT_WEBHOOK_SECRET_FILE telegram_bot_webhook_secret.txt hex',
]) {
  assert.ok(controller.includes(requirement), `controller missing safety contract: ${requirement}`);
}
assert.ok(bootstrap.includes('status --porcelain'));
assert.ok(bootstrap.includes('merge --ff-only'));
assert.ok(!controller.includes('source "${SERVER_ENV}"'));
assert.ok(renderer.includes("'single-domain', 'per-app-domains'"));
assert.ok(renderer.includes('127.0.0.1'));
assert.ok(renderer.includes('ssl_reject_handshake on'));
assert.ok(!renderer.includes('proxy_pass http://${'));

for (const heading of [
  'Fresh server bootstrap',
  'DNS and certificate modes',
  'Safe reruns and updates',
  'Rollback boundary',
  'Agent and operator contract',
]) {
  assert.ok(docs.includes(`## ${heading}`), `single-server docs missing ${heading}`);
}

run('bash', ['-n', 'deploy/single-server/serverctl']);
run('bash', ['-n', 'deploy/single-server/bootstrap.sh']);
run(process.execPath, [
  'scripts/single-server-deployment.mjs',
  'validate',
  '--server-env=deploy/single-server/server.env.example',
  '--production-env=deploy/single-server/production.env.example',
]);

console.log('single-server deployment contract valid');
