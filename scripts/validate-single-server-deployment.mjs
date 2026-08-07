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
  'DATABASE_ENGINE=postgres',
  'MONGODB_URI_FILE=./secrets/mongodb_uri.txt',
  'MONGODB_MIGRATION_URI_FILE=./secrets/mongodb_migration_uri.txt',
  'MONGODB_BACKUP_RESTORE_URI_FILE=./secrets/mongodb_backup_restore_uri.txt',
  'MONGODB_REPLICA_SET=rs0',
  'MONGODB_DATABASE_TOOLS_DOCKER_NETWORK=',
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
  'compose-production.mjs pull',
  '--no-build',
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
  'configure_secret NOTIFICATION_PAYLOAD_ENCRYPTION_KEY_FILE notification_payload_encryption_key.txt base64-32',
  'configure_secret RESEND_API_KEY_FILE resend_api_key.txt empty',
  'configure_secret MAILPACE_SERVER_TOKEN_FILE mailpace_server_token.txt empty',
  'configure_secret REDIS_PASSWORD_FILE redis_password.txt hex',
  'configure_secret MONGODB_ROOT_PASSWORD_FILE mongodb_root_password.txt base64',
  'configure_secret MONGODB_PASSWORD_FILE mongodb_password.txt base64',
  'configure_secret MONGODB_MIGRATION_PASSWORD_FILE mongodb_migration_password.txt base64',
  'configure_secret MONGODB_BACKUP_RESTORE_PASSWORD_FILE mongodb_backup_restore_password.txt base64',
  'configure_secret MONGODB_KEYFILE_FILE mongodb_keyfile.txt base64',
  'configure_secret MONGODB_URI_FILE mongodb_uri.txt empty',
  'configure_secret MONGODB_MIGRATION_URI_FILE mongodb_migration_uri.txt empty',
  'configure_secret MONGODB_BACKUP_RESTORE_URI_FILE mongodb_backup_restore_uri.txt empty',
  'MONGODB_DATABASE_TOOLS_DOCKER_NETWORK nest-react-boilerplate_database',
  'single-node replica set and is not highly available',
  'configure_secret TELEGRAM_BOT_WEBHOOK_SECRET_FILE telegram_bot_webhook_secret.txt hex',
  'configure_secret DISCORD_CUSTOM_ID_SECRET_FILE discord_custom_id_secret.txt hex',
]) {
  assert.ok(controller.includes(requirement), `controller missing safety contract: ${requirement}`);
}
assert.ok(bootstrap.includes('status --porcelain'));
assert.ok(bootstrap.includes('merge --ff-only'));
// One-line unattended bootstrap: a single command must be able to supply the only
// two values that cannot be generated (domain + ACME email) and converge the host.
for (const flag of ['--domain', '--email', '--apply', '--registry', '--image-tag']) {
  assert.ok(bootstrap.includes(flag), `bootstrap must accept ${flag} for unattended one-line installs`);
}
assert.ok(
  bootstrap.includes('PUBLIC_DOMAIN') && bootstrap.includes('CERTBOT_EMAIL') && bootstrap.includes('CERTIFICATE_NAME'),
  'bootstrap must persist the supplied domain and ACME identity',
);
assert.ok(
  /APPLY_AFTER_BOOTSTRAP|apply_after_bootstrap/u.test(bootstrap),
  'bootstrap must only converge the host when apply is explicitly requested',
);
assert.ok(!controller.includes('source "${SERVER_ENV}"'));

// Runtime axis. These are structural checks, not word searches: each asserts that a
// runtime-specific action is reachable ONLY from that runtime's branch.
const controllerFunction = (name) => {
  const start = controller.indexOf(`\n${name}() {`);
  assert.notEqual(start, -1, `controller must define ${name}()`);
  const end = controller.indexOf('\n}\n', start);
  return controller.slice(start, end === -1 ? undefined : end);
};

for (const requirement of [
  'RUNTIME_MODE must be compose or native',
  'COMPOSE_IMAGE_SOURCE must be registry or local',
  'pm2 startup systemd',
  'native-release.mjs',
  'native-runtime-env.mjs',
  'check_native_health',
  'current-commit',
  'previous-commit',
]) {
  assert.ok(controller.includes(requirement), `controller missing native-runtime contract: ${requirement}`);
}

// Compose updates converge prebuilt images, so the compose branch must never install
// dependencies or compile on the host. The native branch must, because it has no
// prebuilt artifact — so assert per branch instead of banning one exact spelling that
// any other spelling would slip past.
const composeInstallers = /pnpm[^\n]*\b(install|run build)\b|native-release\.mjs/u;
for (const name of ['update_checkout', 'install_compose_unit']) {
  assert.ok(
    !composeInstallers.test(controllerFunction(name)),
    `${name} must not build or reinstall the workspace: compose deploys prebuilt images`,
  );
}
assert.match(
  controllerFunction('release_native'),
  /native-release\.mjs" build/u,
  'the native runtime must build from the checkout it deployed',
);
assert.match(
  controllerFunction('release_native'),
  /rsync -a --delete/u,
  'the native runtime must publish the built frontends outside APP_ROOT, not serve the checkout',
);
// PM2 daemonizes, so an inherited flock fd would wedge every later operation.
assert.match(controllerFunction('release_native'), /9>&-/u, 'PM2 must not inherit the controller lock fd');
// Compose provenance decides the unit shape; both halves must stay reachable.
const unit = controllerFunction('install_compose_unit');
assert.match(unit, /IMAGE_SOURCE/u, 'the systemd unit must branch on image provenance');
assert.match(unit, /compose-production\.mjs pull/u, 'registry provenance must pull before starting');
assert.match(unit, /--no-build/u, 'registry provenance must never build');
assert.ok(
  /nothing to pull/u.test(unit),
  'local provenance must omit the pull step instead of pulling tags that do not exist',
);
// Docker is a compose-only dependency; a native host must not join the docker group.
assert.match(
  controllerFunction('provision'),
  /!= 'compose' \]\] \|\| usermod -aG docker/u,
  'docker group membership is root-equivalent and must be gated on the compose runtime',
);
assert.ok(
  docs.includes('in compose runtime mode') && docs.includes('does not run `pnpm install`'),
  'docs must scope the no-install guarantee to the compose runtime',
);
assert.ok(value(serverExample, 'RUNTIME_MODE') === 'compose', 'the example must default to the compose runtime');
assert.ok(value(serverExample, 'PM2_VERSION'), 'the native runtime needs a pinned PM2 version');
assert.ok(bootstrap.includes('--runtime'), 'bootstrap must be able to select the runtime');

// The shared native sequence, used by both serverctl and `pnpm run deploy --preset=native`.
const nativeRelease = read('scripts/native-release.mjs');
const nativeEnv = read('scripts/native-runtime-env.mjs');
assert.match(
  nativeRelease,
  /'startOrReload', 'ecosystem\.config\.cjs', '--update-env'/u,
  'reloading must update the environment or a rotated secret is silently ignored',
);
assert.match(nativeRelease, /--chmod=D755,F644/u, 'the published web root must be readable by nginx');
// Setting both a plain key and its _FILE sibling aborts startup, so these two keys
// must stay paths.
for (const key of ['AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY_FILE', 'NOTIFICATION_PAYLOAD_ENCRYPTION_KEY_FILE']) {
  assert.ok(
    new RegExp(`applicationResolvedSecretFiles[\\s\\S]*${key}`, 'u').test(nativeEnv),
    `${key} must be passed through as a path, never dereferenced`,
  );
}
assert.ok(
  !/secretFileEnvironmentKeys\s*=\s*\{[^}]*AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY_FILE/u.test(nativeEnv),
  'the dereference table must not contain the keys the application resolves itself',
);
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
