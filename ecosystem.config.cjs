/**
 * PM2 process manifest — OPTIONAL advanced native-Node deployment mode.
 *
 * The supported turnkey paths are single-server Docker Compose
 * (deploy/single-server) and Kubernetes (.helm). Use PM2 only when you
 * deliberately want to run the built backend services as host-native Node
 * processes without containers.
 *
 * PM2 does NOT perform these for you — do them first:
 *   1. Build:     pnpm build              → produces dist/apps/backend/*
 *   2. Migrate:   pnpm db:migrate         → run once, before starting the APIs
 *   3. Secrets:   export DATABASE_URL, SESSION_SECRET, BETTER_AUTH_SECRET,
 *                 REDIS_URL, AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY, etc. into the
 *                 environment before `pm2 start`. This manifest deliberately
 *                 does NOT read .env.production — never commit secrets here.
 *   4. Proxy/TLS: front the loopback ports below with nginx/Caddy.
 *   5. Frontends: serve dist/apps/frontend/* SPAs via nginx; the Vike site runs
 *                 as `node dist/apps/frontend/site/server/index.js`.
 *
 * Start:  pm2 start ecosystem.config.cjs           (or --only admin-app-api,user-app-api,auth-app-api)
 * Optional processes: PM2_ENABLE_DISCORD / PM2_ENABLE_TELEGRAM / PM2_ENABLE_NOTIFICATIONS /
 *                     PM2_ENABLE_SITE = true
 *
 * `sudo nrb-server` with RUNTIME_MODE=native drives this manifest for you and derives
 * those flags from the deployment topology.
 */

const isEnabled = (value) => String(value ?? '').toLowerCase() === 'true';

const service = (name, script, extraEnv = {}) => ({
  name,
  cwd: __dirname,
  script,
  interpreter: 'node',
  // Nest apps hold per-process state (schedulers, in-memory caches), so run one
  // fork per service and scale horizontally behind the reverse proxy instead.
  exec_mode: 'fork',
  instances: 1,
  autorestart: true,
  max_restarts: 10,
  min_uptime: '10s',
  max_memory_restart: '512M',
  kill_timeout: 10000,
  merge_logs: true,
  // Only non-secret runtime hints live here. Secrets/URLs are inherited from the
  // environment present when `pm2 start` runs.
  env: { NODE_ENV: 'production', ...extraEnv },
});

// Host processes are only ever reached through the reverse proxy, so they must not
// listen beyond loopback. Compose can publish 127.0.0.1:port from outside the
// container; a native process has to be told directly.
const api = (name, script, portEnvVar, defaultPort) =>
  service(name, script, {
    [portEnvVar]: process.env[portEnvVar] || String(defaultPort),
    HOST: process.env.HOST || '127.0.0.1',
  });

const apps = [
  api('admin-app-api', 'dist/apps/backend/admin/admin-app-api', 'ADMIN_APP_API_PORT', 3001),
  api('user-app-api', 'dist/apps/backend/user/user-app-api', 'USER_APP_API_PORT', 3002),
  api('auth-app-api', 'dist/apps/backend/auth/auth-app-api', 'AUTH_APP_API_PORT', 3003),
];

// Optional integrations — enabled explicitly, since each needs its own provider
// configuration (bot tokens, NATS, etc.) exported into the environment.
// Ports match .env.production.example and the nginx renderer; a different default
// here would make the proxy forward to a port nothing listens on.
if (isEnabled(process.env.PM2_ENABLE_DISCORD)) {
  apps.push(api('discord-app-api', 'dist/apps/backend/discord/discord-app-api', 'DISCORD_APP_API_PORT', 3007));
}
if (isEnabled(process.env.PM2_ENABLE_TELEGRAM)) {
  apps.push(api('telegram-bot-api', 'dist/apps/backend/telegram/telegram-bot-api', 'TELEGRAM_BOT_API_PORT', 3013));
}
// The Vike site is server-rendered, so it stays a process even when every SPA is
// served from disk. Enabled whenever a deployment renders a site vhost.
if (isEnabled(process.env.PM2_ENABLE_SITE)) {
  apps.push(api('site-app', 'dist/apps/frontend/site/server/index.js', 'SITE_APP_PORT', 4203));
}
if (isEnabled(process.env.PM2_ENABLE_NOTIFICATIONS)) {
  apps.push(service('notification-consumer', 'dist/apps/backend/notification/notification-consumer'));
  apps.push(service('notification-scheduler', 'dist/apps/backend/notification/notification-scheduler'));
}

module.exports = { apps };
