/**
 * Single delivery inventory.
 *
 * Compose, Helm, promotion, and the CI pin checks all read these tables. Hosts
 * that run `compose-production.mjs` without installing `@repo/tooling` still
 * need this file to stay dependency-free. `scripts/delivery-inventory.spec.mjs`
 * asserts the public-app rows stay identical to the TypeScript setup catalog.
 */
export const helmVersion = 'v4.2.3';
export const mongoImage = 'mongo:8.0.32-noble';
export const postgresImage = 'postgres:17.11-alpine';

export const observabilityImages = Object.freeze({
  'otel-collector':
    'otel/opentelemetry-collector-contrib:0.161.0@sha256:fd328de2552466ad78385e1b1289c3f2402b1c45f265b252aab1955b42845ac1',
  prometheus: 'prom/prometheus:v3.15.0@sha256:efd719c99d83b060d9daefdcf00360461adf279f45ef5391f8d111892118753e',
  alertmanager: 'prom/alertmanager:v0.34.1@sha256:e9733bafb1bdef9b00e25a21f8f99dc26a22224bf16641ad754d1649f4c3357a',
  grafana: 'grafana/grafana:13.2.3@sha256:b28bae15e219c998fb0e0424ed724930cc61b1f61fb404d47c862f9a23f9e572',
  coroot: 'ghcr.io/coroot/coroot:1.27.0@sha256:f63750085f6b3adc62e0441a56807a75cf81ad8ec5df8c3517c357116ea1babb',
});

export const localObservabilityImages = Object.freeze({
  grafana: observabilityImages.grafana,
  loki: 'grafana/loki:3.7.8@sha256:1107dd5274e0ada47e42472b7a7e71f3b2a2fe878878108f3e2f9e51528f0193',
  tempo: 'grafana/tempo:3.1.0@sha256:3076b8dcdfb32fd6bc5ccef85e7b7313e6199b9cb84366257fc17ecb696db5fd',
});

export const productionAppIds = Object.freeze([
  'admin-app',
  'admin-app-api',
  'auth-app-api',
  'discord-app-api',
  'landing-app',
  'mobile-app',
  'notification-consumer',
  'notification-scheduler',
  'site-app',
  'telegram-bot-api',
  'user-app',
  'user-app-api',
]);

export function helmAppKey(appId) {
  return appId.replace(/-([a-z])/gu, (_, character) => character.toUpperCase());
}

export const helmAppKeys = Object.freeze(
  Object.fromEntries(productionAppIds.map((appId) => [appId, helmAppKey(appId)])),
);

/**
 * Every app the edge can publish, as `[appId, domainEnvName, composeUpstream]`.
 * Any entry may own the apex. The apex is a product decision, not a property of
 * the marketing shells.
 */
export const publicApps = Object.freeze([
  ['landing-app', 'LANDING_APP_DOMAIN', 'landing-app:8080'],
  ['site-app', 'SITE_APP_DOMAIN', 'site-app:80'],
  ['user-app', 'USER_APP_DOMAIN', 'user-app:8080'],
  ['admin-app', 'ADMIN_APP_DOMAIN', 'admin-app:8080'],
  ['mobile-app', 'MOBILE_APP_DOMAIN', 'mobile-app:8080'],
  ['auth-app-api', 'AUTH_APP_API_DOMAIN', 'auth-app-api:80'],
  ['user-app-api', 'USER_APP_API_DOMAIN', 'user-app-api:80'],
  ['admin-app-api', 'ADMIN_APP_API_DOMAIN', 'admin-app-api:80'],
  ['discord-app-api', 'DISCORD_APP_API_DOMAIN', 'discord-app-api:80'],
  ['telegram-bot-api', 'TELEGRAM_BOT_API_DOMAIN', 'telegram-bot-api:80'],
]);

export const helmValueFiles = Object.freeze([
  '.helm/values.yaml',
  '.helm/values-production.yaml',
  '.helm/values-selection.yaml',
]);

/**
 * Secrets that can be generated locally, with the byte length fed to the
 * base64 encoder. Everything else declared by an overlay is treated as
 * externally issued.
 */
export const generatableSecrets = Object.freeze({
  session_secret: 48,
  better_auth_secret: 48,
  auth_provider_token_encryption_key: 32,
  notification_payload_encryption_key: 32,
  redis_password: 32,
  grafana_admin_password: 32,
  postgres_password: 32,
  telegram_bot_webhook_secret: 32,
  discord_custom_id_secret: 32,
});
