#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const candidates = ['ecosystem.config.js', 'ecosystem.config.cjs', 'ecosystem.config.mjs'];
const found = candidates.map((name) => new URL(`../${name}`, import.meta.url)).find((url) => existsSync(url));

if (!found) {
  console.log(
    'PM2 validation skipped: no ecosystem.config.{js,cjs,mjs} file is present for this optional deployment mode.',
  );
  process.exit(0);
}

const configPath = fileURLToPath(found);
const raw = readFileSync(configPath, 'utf8');

// Secrets must be injected through the environment, never inlined into the
// manifest. Strip comments first so documentation may reference the env file
// while still catching any real attempt to load it.
const codeOnly = raw.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/(^|[^:])\/\/.*$/gmu, '$1');
assert.ok(
  !codeOnly.includes('.env.production'),
  'ecosystem config must not read .env.production; export secrets into the environment instead.',
);

const config = configPath.endsWith('.mjs') ? (await import(found.href)).default : require(configPath);
assert.ok(Array.isArray(config.apps) && config.apps.length > 0, 'ecosystem config must export a non-empty apps array');

const SECRETISH = /SECRET|PASSWORD|TOKEN|DATABASE_URL|ENCRYPTION_KEY|API_KEY/u;
const byName = new Map();
for (const app of config.apps) {
  assert.equal(typeof app.name, 'string', 'each PM2 app must have a name');
  assert.match(String(app.script), /^dist\/apps\//u, `${app.name} must run a built artifact under dist/apps/`);
  for (const key of Object.keys(app.env ?? {})) {
    assert.ok(
      !SECRETISH.test(key),
      `${app.name} env must not carry secrets (${key}); export them into the process environment instead`,
    );
  }
  byName.set(app.name, app);
}

// The core HTTP APIs must always be present and must bind an explicit port.
for (const [name, portEnvVar] of [
  ['admin-app-api', 'ADMIN_APP_API_PORT'],
  ['user-app-api', 'USER_APP_API_PORT'],
  ['auth-app-api', 'AUTH_APP_API_PORT'],
]) {
  const app = byName.get(name);
  assert.ok(app, `PM2 config must define the ${name} service`);
  assert.ok(app.env && app.env[portEnvVar], `${name} must set ${portEnvVar} (explicit port, with a PORT fallback)`);
  // Host processes sit behind the reverse proxy; nothing may listen publicly.
  assert.equal(app.env.HOST, '127.0.0.1', `${name} must bind loopback only`);
}

// Optional processes are opt-in, and their ports must agree with the edge renderer:
// a different default here silently proxies to a port nothing listens on.
const optional = [
  ['PM2_ENABLE_DISCORD', 'discord-app-api', 'DISCORD_APP_API_PORT', '3007'],
  ['PM2_ENABLE_TELEGRAM', 'telegram-bot-api', 'TELEGRAM_BOT_API_PORT', '3013'],
  ['PM2_ENABLE_SITE', 'site-app', 'SITE_APP_PORT', '4203'],
];
for (const [flag, name, portEnvVar, expectedPort] of optional) {
  assert.ok(!byName.has(name), `${name} must stay disabled unless ${flag} is set`);
  assert.match(raw, new RegExp(`${flag}`, 'u'), `${name} must be gated on ${flag}`);
  assert.match(
    raw,
    new RegExp(`'${portEnvVar}',\\s*${expectedPort}`, 'u'),
    `${name} must default ${portEnvVar} to ${expectedPort} to match the edge renderer`,
  );
}

// The Vike site is server-rendered, so static frontend deployments still need it.
assert.match(raw, /dist\/apps\/frontend\/site\/server\/index\.js/u, 'PM2 must be able to run the SSR site');

console.log(`pm2 config contract valid (${config.apps.length} services)`);
