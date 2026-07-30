#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ConnectionString from 'mongodb-connection-string-url';
import { resolveSelectedProductClosureContext } from './closure-build-context.mjs';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const defaultEnvFile = '.env.production';
const actions = new Set(['build', 'config', 'down', 'logs', 'ps', 'pull', 'up']);
const databaseModes = new Set(['bundled-db', 'external-db']);
const domainModes = new Set(['external-proxy', 'single-domain', 'per-app-domains']);
const publicDomainModes = new Set(['single-domain', 'per-app-domains']);
const frontendApiBaseUrlModes = new Set(['same-origin', 'split-origin']);
const frontendApiBaseUrlKeys = ['VITE_AUTH_API_BASE_URL', 'VITE_USER_API_BASE_URL', 'VITE_ADMIN_API_BASE_URL'];
const tlsModes = new Set(['automatic', 'provided', 'external']);
const imageSources = new Set(['local', 'registry']);
const supportedProfiles = new Set(['discord', 'notification-consumer', 'notification-scheduler', 'telegram']);
const profileApps = {
  discord: 'discord-app-api',
  'notification-consumer': 'notification-consumer',
  'notification-scheduler': 'notification-scheduler',
  telegram: 'telegram-bot-api',
};
const productionApps = new Set([
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
const productionComposeServices = new Set([
  ...productionApps,
  'alertmanager',
  'edge',
  'grafana',
  'migrate',
  'mongodb',
  'mongodb-init',
  'otel-collector',
  'postgres',
  'prometheus',
  'redis',
]);
const primaryUpstreams = {
  'landing-app': 'landing-app:8080',
  'site-app': 'site-app:80',
};
const publicApps = [
  ['landing-app', 'LANDING_APP_DOMAIN'],
  ['site-app', 'SITE_APP_DOMAIN'],
  ['user-app', 'USER_APP_DOMAIN'],
  ['admin-app', 'ADMIN_APP_DOMAIN'],
  ['mobile-app', 'MOBILE_APP_DOMAIN'],
  ['auth-app-api', 'AUTH_APP_API_DOMAIN'],
  ['user-app-api', 'USER_APP_API_DOMAIN'],
  ['admin-app-api', 'ADMIN_APP_API_DOMAIN'],
  ['discord-app-api', 'DISCORD_APP_API_DOMAIN'],
  ['telegram-bot-api', 'TELEGRAM_BOT_API_DOMAIN'],
];

export const productionComposeDiagnostics = Object.freeze({
  dryRun: JSON.stringify({ status: 'validated', execution: 'skipped' }, null, 2),
  start: 'Production Compose topology validated; starting Docker Compose.',
  closureFailure:
    'Production Compose closure validation failed; run `pnpm nrb closure check`. [NRB_COMPOSE_CLOSURE_INVALID]',
  configurationFailure:
    'Production Compose input validation failed; review the documented arguments and required settings. [NRB_COMPOSE_INPUT_INVALID]',
  executionFailure:
    'Production Compose execution failed; verify Docker availability and review Docker output. [NRB_COMPOSE_EXECUTION_FAILED]',
});

export function composeExecutionStatus(result, reportFailure = (message) => console.error(message)) {
  if (result.error) throw result.error;
  const status = result.status ?? 1;
  if (status !== 0) reportFailure(productionComposeDiagnostics.executionFailure);
  return status;
}

const fail = (message) => {
  throw new Error(message);
};

export function parseEnvFile(content) {
  const result = {};
  for (const sourceLine of content.split(/\r?\n/u)) {
    const line = sourceLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

export function validateBaseDomain(value) {
  const domain = value.trim().toLowerCase().replace(/\.$/u, '');
  const labels = domain.split('.');
  const validLabel = (label) =>
    label.length >= 1 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(label);
  if (domain.length > 253 || labels.length < 2 || labels.some((label) => !validLabel(label))) {
    fail(`PUBLIC_DOMAIN must be a DNS base name without a protocol, port, path, or wildcard (received "${value}").`);
  }
  return domain;
}

export function derivePublicDomains(baseDomain, primaryApp) {
  if (!Object.hasOwn(primaryUpstreams, primaryApp)) {
    fail('PRIMARY_APP must be either "landing-app" or "site-app".');
  }
  const domain = validateBaseDomain(baseDomain);
  return Object.fromEntries(
    publicApps.map(([appId, envName]) => [envName, appId === primaryApp ? domain : `${appId}.${domain}`]),
  );
}

const splitList = (value) =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const unique = (values) => [...new Set(values)];

export function readProductionClosure(workspaceRoot, configuredManifest) {
  const manifestPath = configuredManifest
    ? resolve(workspaceRoot, configuredManifest)
    : resolve(workspaceRoot, '.nrb/closure.json');
  if (!existsSync(manifestPath)) {
    fail('A setup-selected .nrb/closure.json is required; run `pnpm nrb setup`.');
  }
  let closure;
  try {
    closure = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    fail(`Selected closure is not valid JSON: ${manifestPath}.`);
  }
  const sortedUniqueStrings = (value, field) => {
    if (
      !Array.isArray(value) ||
      value.some((entry) => typeof entry !== 'string') ||
      new Set(value).size !== value.length ||
      value.some((entry, index) => index > 0 && value[index - 1] > entry)
    ) {
      fail(`Selected closure ${field} must be a sorted unique string array.`);
    }
    return value;
  };
  if (closure?.schemaVersion !== 1 || !['postgres', 'mongodb', null].includes(closure.provider)) {
    fail('Selected closure must use schemaVersion 1 and provider postgres, mongodb, or null.');
  }
  const roots = sortedUniqueStrings(closure.roots, 'roots');
  const services = sortedUniqueStrings(closure.services, 'services');
  const releaseImages = sortedUniqueStrings(closure.releaseImages, 'releaseImages');
  const selectedApps = releaseImages.filter((image) => image !== 'migrator');
  const unknown = selectedApps.filter((appId) => !productionApps.has(appId));
  if (unknown.length > 0)
    fail(`Selected closure contains apps without production Compose metadata: ${unknown.join(', ')}.`);
  if (selectedApps.some((appId) => !roots.includes(appId))) {
    fail('Selected closure releaseImages must be selected application roots.');
  }
  if (releaseImages.includes('migrator') !== (closure.provider !== null)) {
    fail('Selected closure migrator image must be present exactly when a durable provider is selected.');
  }
  const edgeCaddyfiles = {
    'per-app-domains': resolve(dirname(manifestPath), 'Caddyfile.per-app-domains'),
    'single-domain': resolve(dirname(manifestPath), 'Caddyfile.single-domain'),
  };
  if (Object.values(edgeCaddyfiles).some((path) => !existsSync(path))) {
    fail('Selected closure Caddyfiles are missing or stale; rerun `pnpm nrb setup`.');
  }
  return { edgeCaddyfiles, provider: closure.provider, releaseImages, roots, selectedApps, services };
}

function parseArguments(argv) {
  const [action, ...raw] = argv;
  if (!actions.has(action)) {
    fail(`Usage: node scripts/compose-production.mjs <${[...actions].join('|')}> [options]`);
  }
  const options = {
    action,
    databaseMode: undefined,
    databaseEngine: undefined,
    domainMode: undefined,
    dryRun: false,
    envFile: defaultEnvFile,
    profiles: [],
    sourceBuild: action === 'build',
    imageSource: undefined,
    tlsMode: undefined,
    composeArguments: [],
  };
  for (let index = 0; index < raw.length; index += 1) {
    const item = raw[index];
    const readOption = (name) => {
      if (item === name) {
        const value = raw[index + 1];
        if (!value) fail(`${name} requires a value.`);
        index += 1;
        return value;
      }
      if (item.startsWith(`${name}=`)) return item.slice(name.length + 1);
      return undefined;
    };
    const databaseMode = readOption('--database');
    if (databaseMode !== undefined) {
      options.databaseMode = databaseMode;
      continue;
    }
    const databaseEngine = readOption('--engine');
    if (databaseEngine !== undefined) {
      options.databaseEngine = databaseEngine;
      continue;
    }
    const domainMode = readOption('--domains');
    if (domainMode !== undefined) {
      options.domainMode = domainMode;
      continue;
    }
    const tlsMode = readOption('--tls');
    if (tlsMode !== undefined) {
      options.tlsMode = tlsMode;
      continue;
    }
    const imageSource = readOption('--images') ?? readOption('--image-source');
    if (imageSource !== undefined) {
      options.imageSource = imageSource;
      continue;
    }
    const envFile = readOption('--env-file');
    if (envFile !== undefined) {
      options.envFile = envFile;
      continue;
    }
    const profile = readOption('--profile');
    if (profile !== undefined) {
      options.profiles.push(...splitList(profile));
      continue;
    }
    if (item === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (item === '--source-build') {
      options.sourceBuild = true;
      continue;
    }
    options.composeArguments.push(item);
  }
  if (options.sourceBuild && !new Set(['build', 'config', 'up']).has(action)) {
    fail('--source-build is only valid with build, config, or up.');
  }
  if (options.sourceBuild && action === 'up' && options.composeArguments.includes('--no-build')) {
    fail('--source-build and --no-build cannot be used together.');
  }
  if (!options.sourceBuild && action === 'up' && options.composeArguments.includes('--build')) {
    fail('Use --source-build instead of passing --build to a production image deployment.');
  }
  return options;
}

const requireMode = (value, allowed, name) => {
  if (!value) fail(`${name} is required in .env.production or as a command option.`);
  if (!allowed.has(value)) fail(`${name} must be one of: ${[...allowed].join(', ')}.`);
  return value;
};

const valueOrDefault = (environment, key, fallback) => {
  const value = environment[key]?.trim();
  return value ? value : fallback;
};

const requireAbsoluteHttpOrigin = (value, name) => {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`${name} must be an absolute HTTP(S) origin.`);
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    fail(`${name} must be an absolute HTTP(S) origin without credentials, a path, query, or fragment.`);
  }
  return url.origin;
};

export function validateExternalMongoUri(value, { deploymentWide = false, label = 'MONGODB_URI_FILE' } = {}) {
  let url;
  try {
    url = new ConnectionString(value.trim());
  } catch {
    fail(`${label} must contain a valid mongodb:// or mongodb+srv:// URI.`);
  }
  if (url.hosts.some((host) => !host.trim())) {
    fail(`${label} must contain a valid mongodb:// or mongodb+srv:// URI.`);
  }
  const replicaSets = [...url.searchParams.entries()]
    .filter(([key]) => key.toLowerCase() === 'replicaset')
    .map(([, optionValue]) => optionValue.trim());
  if (replicaSets.length === 0 || replicaSets.some((replicaSet) => !replicaSet)) {
    fail('External MongoDB requires a non-empty replicaSet URI option.');
  }
  if (new Set(replicaSets).size !== 1) {
    fail('External MongoDB replicaSet URI options must not conflict.');
  }
  if (deploymentWide && url.pathname !== '/') {
    fail(`${label} must be deployment-wide and must not select a database path.`);
  }
  if (
    deploymentWide &&
    ![...url.searchParams.entries()].some(
      ([key, optionValue]) => key.toLowerCase() === 'authsource' && optionValue.toLowerCase() === 'admin',
    )
  ) {
    fail(`${label} must use authSource=admin.`);
  }
  return url;
}

export function buildComposeInvocation(argv, processEnvironment = process.env, dependencies = {}) {
  const options = parseArguments(argv);
  const envPath = resolve(rootDir, options.envFile);
  if (!existsSync(envPath)) {
    fail(`Environment file not found: ${options.envFile}. Copy .env.production.example first.`);
  }
  const fileEnvironment = parseEnvFile(readFileSync(envPath, 'utf8'));
  const effectiveEnvironment = { ...fileEnvironment, ...processEnvironment };
  const closure = (dependencies.readProductionClosure ?? readProductionClosure)(
    rootDir,
    effectiveEnvironment.NRB_CLOSURE_MANIFEST,
  );
  const closureContext = options.sourceBuild
    ? (dependencies.resolveSelectedProductClosureContext ?? resolveSelectedProductClosureContext)(
        rootDir,
        effectiveEnvironment.NRB_CLOSURE_CONTEXT,
      )
    : undefined;
  let mongoReplicaSet;
  const configuredDatabaseEngine = options.databaseEngine ?? effectiveEnvironment.DATABASE_ENGINE?.trim().toLowerCase();
  const configuredDatabaseMode = options.databaseMode ?? effectiveEnvironment.COMPOSE_DATABASE_MODE?.trim();
  if (closure.provider === null && (configuredDatabaseEngine || configuredDatabaseMode)) {
    fail('DATABASE_ENGINE and COMPOSE_DATABASE_MODE must be empty for a provider-free selected closure.');
  }
  if (closure.provider !== null && configuredDatabaseEngine && configuredDatabaseEngine !== closure.provider) {
    fail(`DATABASE_ENGINE=${configuredDatabaseEngine} conflicts with selected closure provider ${closure.provider}.`);
  }
  const databaseEngine = closure.provider;
  const databaseMode = databaseEngine
    ? requireMode(configuredDatabaseMode, databaseModes, 'COMPOSE_DATABASE_MODE')
    : undefined;
  if (databaseEngine === 'mongodb' && databaseMode === 'bundled-db') {
    const principalNames = [
      valueOrDefault(effectiveEnvironment, 'MONGODB_USER', 'nest_react_boilerplate'),
      valueOrDefault(effectiveEnvironment, 'MONGODB_MIGRATION_USER', 'nest_react_boilerplate_migration'),
      valueOrDefault(effectiveEnvironment, 'MONGODB_BACKUP_RESTORE_USER', 'nrb_backup_restore'),
    ];
    if (new Set(principalNames).size !== principalNames.length) {
      fail('MONGODB_USER, MONGODB_MIGRATION_USER, and MONGODB_BACKUP_RESTORE_USER must be distinct.');
    }
  }
  if (databaseEngine === 'mongodb' && databaseMode === 'external-db') {
    const uriSecrets = [
      ['MONGODB_URI_FILE', './secrets/mongodb_uri.txt', false],
      ['MONGODB_MIGRATION_URI_FILE', './secrets/mongodb_migration_uri.txt', false],
      ['MONGODB_BACKUP_RESTORE_URI_FILE', './secrets/mongodb_backup_restore_uri.txt', true],
    ];
    const parsedUris = uriSecrets.map(([name, fallback, deploymentWide]) => {
      const configuredPath = valueOrDefault(effectiveEnvironment, name, fallback);
      const mongoUriPath = resolve(rootDir, 'docker', configuredPath);
      if (!existsSync(mongoUriPath)) fail(`${name} secret file not found: ${configuredPath}.`);
      return validateExternalMongoUri(readFileSync(mongoUriPath, 'utf8'), { deploymentWide, label: name });
    });
    const [mongoUri] = parsedUris;
    const principalNames = parsedUris.map((uri) => uri.username);
    if (principalNames.some((name) => !name) || new Set(principalNames).size !== principalNames.length) {
      fail('External MongoDB runtime, migration, and backup/restore URI usernames must be non-empty and distinct.');
    }
    mongoReplicaSet = [...mongoUri.searchParams.entries()].find(([key]) => key.toLowerCase() === 'replicaset')?.[1];
    const configuredReplicaSet = effectiveEnvironment.MONGODB_REPLICA_SET?.trim();
    if (configuredReplicaSet && configuredReplicaSet !== mongoReplicaSet) {
      fail('MONGODB_REPLICA_SET must match the external MongoDB URI replicaSet option.');
    }
    for (const parsedUri of parsedUris.slice(1)) {
      const uriReplicaSet = [...parsedUri.searchParams.entries()].find(
        ([key]) => key.toLowerCase() === 'replicaset',
      )?.[1];
      if (uriReplicaSet !== mongoReplicaSet) {
        fail('All external MongoDB principal URIs must use the same replicaSet option.');
      }
    }
  }
  const domainMode = requireMode(
    options.domainMode ?? effectiveEnvironment.COMPOSE_DOMAIN_MODE,
    domainModes,
    'COMPOSE_DOMAIN_MODE',
  );
  const tlsMode = requireMode(options.tlsMode ?? effectiveEnvironment.COMPOSE_TLS_MODE, tlsModes, 'COMPOSE_TLS_MODE');
  // Image provenance: pull published images (default) or build them on this host.
  // Deliberately defaulted rather than required so env files that predate the axis
  // keep validating — serverctl re-validates every provisioned host on update.
  const imageSource = requireMode(
    options.imageSource ?? effectiveEnvironment.COMPOSE_IMAGE_SOURCE ?? 'registry',
    imageSources,
    'COMPOSE_IMAGE_SOURCE',
  );
  // `build` always needs the overlay, whatever the configured provenance is.
  const sourceBuild = options.sourceBuild || imageSource === 'local';
  const frontendApiBaseUrlMode = requireMode(
    valueOrDefault(effectiveEnvironment, 'VITE_API_BASE_URL_MODE', 'same-origin').toLowerCase(),
    frontendApiBaseUrlModes,
    'VITE_API_BASE_URL_MODE',
  );
  const expectedFrontendNginxConfig =
    frontendApiBaseUrlMode === 'same-origin' ? 'docker/nginx-fullstack.conf' : 'docker/nginx-spa.conf';
  const frontendNginxConfig = valueOrDefault(
    effectiveEnvironment,
    'FRONTEND_NGINX_CONFIG',
    expectedFrontendNginxConfig,
  );
  if (frontendNginxConfig !== expectedFrontendNginxConfig) {
    fail(
      `FRONTEND_NGINX_CONFIG must be ${expectedFrontendNginxConfig} when VITE_API_BASE_URL_MODE=${frontendApiBaseUrlMode}.`,
    );
  }
  const frontendBuildEnvironment = {
    FRONTEND_NGINX_CONFIG: frontendNginxConfig,
    VITE_API_BASE_URL_MODE: frontendApiBaseUrlMode,
    ...(frontendApiBaseUrlMode === 'same-origin'
      ? Object.fromEntries(frontendApiBaseUrlKeys.map((key) => [key, '']))
      : Object.fromEntries(
          frontendApiBaseUrlKeys.map((key) => {
            const value = valueOrDefault(effectiveEnvironment, key, '');
            if (!value) fail(`${key} is required when VITE_API_BASE_URL_MODE=split-origin.`);
            return [key, requireAbsoluteHttpOrigin(value, key)];
          }),
        )),
  };
  if (domainMode === 'external-proxy' && tlsMode !== 'external') {
    fail('COMPOSE_TLS_MODE must be "external" when COMPOSE_DOMAIN_MODE is "external-proxy".');
  }
  if (domainMode !== 'external-proxy' && tlsMode === 'external') {
    fail('COMPOSE_TLS_MODE must be "automatic" or "provided" when the Compose edge is enabled.');
  }

  const requestedProfiles = unique([...splitList(effectiveEnvironment.COMPOSE_PROFILES), ...options.profiles]).sort();
  for (const profile of requestedProfiles) {
    if (!supportedProfiles.has(profile)) {
      fail(
        `Unsupported production profile "${profile}". Supported profiles: discord, notification-consumer, notification-scheduler, telegram.`,
      );
    }
    if (!closure.selectedApps.includes(profileApps[profile])) {
      fail(`Production profile "${profile}" cannot enable unselected app "${profileApps[profile]}".`);
    }
  }
  const profiles = Object.entries(profileApps)
    .filter(([, appId]) => closure.selectedApps.includes(appId))
    .map(([profile]) => profile)
    .sort();
  if (domainMode === 'single-domain' && profiles.some((profile) => profile === 'telegram' || profile === 'discord')) {
    fail(
      'Optional Telegram/Discord profiles require per-app-domains (or an operator-owned external proxy) because their user app and API must both remain publicly reachable.',
    );
  }

  const baseDomain = validateBaseDomain(effectiveEnvironment.PUBLIC_DOMAIN ?? '');
  const primaryApp = effectiveEnvironment.PRIMARY_APP ?? '';
  if (domainMode !== 'external-proxy' && !closure.selectedApps.includes(primaryApp)) {
    fail('PRIMARY_APP must be selected when Compose owns the public edge.');
  }
  const domains = derivePublicDomains(baseDomain, primaryApp);
  const configuredExternalPublicMode = effectiveEnvironment.EXTERNAL_PROXY_PUBLIC_MODE?.trim();
  if (configuredExternalPublicMode && !publicDomainModes.has(configuredExternalPublicMode)) {
    fail('EXTERNAL_PROXY_PUBLIC_MODE must be either "single-domain" or "per-app-domains".');
  }
  const publicDomainMode = domainMode === 'external-proxy' ? configuredExternalPublicMode : domainMode;
  const frontendOrigins = publicApps
    .filter(([appId]) => closure.selectedApps.includes(appId) && appId.endsWith('-app'))
    .map(([, key]) => `https://${domains[key]}`);
  const exposedOrigins = publicDomainMode === 'single-domain' ? [`https://${baseDomain}`] : frontendOrigins;
  const extraCorsOrigins = splitList(effectiveEnvironment.CORS_EXTRA_ORIGINS);
  const extraTrustedOrigins = splitList(effectiveEnvironment.BETTER_AUTH_EXTRA_TRUSTED_ORIGINS);
  const authOrigin =
    publicDomainMode === 'single-domain' ? `https://${baseDomain}` : `https://${domains.AUTH_APP_API_DOMAIN}`;
  const selectedLandingDestinations = (adminUrl, userUrl) => ({
    ...(closure.selectedApps.includes('admin-app') ? { LANDING_ADMIN_APP_URL: adminUrl } : {}),
    ...(closure.selectedApps.includes('user-app') ? { LANDING_USER_APP_URL: userUrl } : {}),
  });
  const landingAppRuntimeDefaults =
    publicDomainMode === 'single-domain'
      ? selectedLandingDestinations('/admin', '/app')
      : publicDomainMode === 'per-app-domains'
        ? selectedLandingDestinations(`https://${domains.ADMIN_APP_DOMAIN}`, `https://${domains.USER_APP_DOMAIN}`)
        : {};
  const runtimeDefaults =
    domainMode === 'external-proxy' && !publicDomainMode
      ? {}
      : {
          ...landingAppRuntimeDefaults,
          AUTH_ALLOWED_RETURN_URLS: unique(exposedOrigins).join(','),
          AUTH_OAUTH_REDIRECT_URI: `${authOrigin}/oauth/callback`,
          BETTER_AUTH_TRUSTED_ORIGINS: unique([...exposedOrigins, ...extraTrustedOrigins]).join(','),
          BETTER_AUTH_URL:
            publicDomainMode === 'single-domain' ? `https://${baseDomain}` : `https://${domains.USER_APP_DOMAIN}`,
          CORS_ORIGINS: unique([...exposedOrigins, ...extraCorsOrigins]).join(','),
          DISCORD_WEB_APP_BASE_URL:
            publicDomainMode === 'single-domain' ? `https://${baseDomain}` : `https://${domains.USER_APP_DOMAIN}`,
          DISCORD_INTERACTIONS_ENDPOINT:
            publicDomainMode === 'single-domain'
              ? `https://${baseDomain}/discord/interactions`
              : `https://${domains.DISCORD_APP_API_DOMAIN}/discord/interactions`,
          DISCORD_REDIRECT_URI: `${authOrigin}/auth/discord/callback`,
          TELEGRAM_BOT_WEBHOOK_URL:
            publicDomainMode === 'single-domain'
              ? `https://${baseDomain}/telegram/webhook`
              : `https://${domains.TELEGRAM_BOT_API_DOMAIN}/telegram/webhook`,
          TELEGRAM_MINI_APP_URL:
            publicDomainMode === 'single-domain'
              ? `https://${baseDomain}/telegram-mini-app`
              : `https://${domains.USER_APP_DOMAIN}/telegram-mini-app`,
        };

  const composeEnvironment = {
    ...processEnvironment,
    DOCKER_BUILDKIT: '1',
    ...(closureContext ? { NRB_CLOSURE_CONTEXT: closureContext } : {}),
    ...domains,
    ...runtimeDefaults,
    ...frontendBuildEnvironment,
    ...(profiles.includes('telegram')
      ? {
          AUTH_TELEGRAM_ENABLED: 'true',
          TELEGRAM_OIDC_ENABLED: 'true',
          VITE_TELEGRAM_AUTH_ENABLED: 'true',
        }
      : {}),
    ...(profiles.includes('discord') ? { DISCORD_AUTH_ENABLED: 'true' } : {}),
    COMPOSE_DATABASE_MODE: databaseMode,
    DATABASE_ENGINE: databaseEngine,
    ...(mongoReplicaSet ? { MONGODB_REPLICA_SET: mongoReplicaSet } : {}),
    COMPOSE_DOMAIN_MODE: domainMode,
    COMPOSE_TLS_MODE: tlsMode,
    ...(domainMode === 'external-proxy' && publicDomainMode ? { EXTERNAL_PROXY_PUBLIC_MODE: publicDomainMode } : {}),
    // Only discord/telegram have Caddy site/route fragments; notification-* are
    // background workers with no edge surface. Keep the fixed discord-first order
    // so the combined value matches the generated "discord-telegram" fragment.
    EDGE_OPTIONAL_ROUTES:
      ['discord', 'telegram'].filter((profile) => profiles.includes(profile)).join('-') || 'default',
    ...(domainMode !== 'external-proxy'
      ? {
          EDGE_CADDYFILE: '/nrb/Caddyfile.selected',
          NRB_EDGE_CADDYFILE: closure.edgeCaddyfiles?.[domainMode] ?? resolve(rootDir, `.nrb/Caddyfile.${domainMode}`),
        }
      : {}),
    PRIMARY_APP: primaryApp,
    PRIMARY_APP_UPSTREAM: primaryUpstreams[primaryApp],
    PUBLIC_DOMAIN: baseDomain,
  };
  for (const [key, value] of Object.entries(fileEnvironment)) {
    if (!Object.hasOwn(composeEnvironment, key)) composeEnvironment[key] = value;
  }
  if (domainMode === 'external-proxy' && !publicDomainMode) {
    for (const required of [
      'AUTH_ALLOWED_RETURN_URLS',
      'CORS_ORIGINS',
      'BETTER_AUTH_URL',
      'BETTER_AUTH_TRUSTED_ORIGINS',
    ]) {
      composeEnvironment[required] = valueOrDefault(effectiveEnvironment, required, '');
      if (!composeEnvironment[required]) fail(`${required} is required in external-proxy mode.`);
    }
  }

  const files = ['docker/docker-compose.prod.yml'];
  if (databaseEngine) {
    files.push(
      databaseEngine === 'postgres'
        ? `docker/docker-compose.prod.${databaseMode}.yml`
        : `docker/docker-compose.prod.mongodb-${databaseMode}.yml`,
    );
  }
  if (closure.services.includes('redis')) files.push('docker/docker-compose.prod.redis.yml');
  if (profiles.includes('telegram')) files.push('docker/docker-compose.prod.telegram.yml');
  if (profiles.includes('discord')) files.push('docker/docker-compose.prod.discord.yml');
  if (domainMode !== 'external-proxy') files.push('docker/docker-compose.prod.edge.yml');
  if (tlsMode === 'provided') files.push('docker/docker-compose.prod.edge-provided-tls.yml');
  if (sourceBuild) files.push('docker/docker-compose.prod.build.yml');

  const selectedServices = [
    ...closure.selectedApps,
    ...(databaseEngine ? ['migrate'] : []),
    ...(databaseMode === 'bundled-db' && databaseEngine === 'postgres' ? ['postgres'] : []),
    ...(databaseMode === 'bundled-db' && databaseEngine === 'mongodb' ? ['mongodb', 'mongodb-init'] : []),
    ...(closure.services.includes('redis') ? ['redis'] : []),
    ...(domainMode !== 'external-proxy' ? ['edge'] : []),
  ];
  const actionServices =
    options.action === 'build'
      ? closure.releaseImages.map((name) => (name === 'migrator' ? 'migrate' : name))
      : selectedServices;
  const selectedServiceSet = new Set(selectedServices);
  for (const argument of options.composeArguments) {
    const referencedService = argument.split('=').find((part) => productionComposeServices.has(part));
    if (referencedService && !selectedServiceSet.has(referencedService)) {
      fail(`Compose argument cannot reference unselected service "${referencedService}".`);
    }
  }

  const composeArgs = ['compose', '--env-file', options.envFile];
  for (const file of files) composeArgs.push('-f', file);
  for (const profile of profiles) composeArgs.push('--profile', profile);
  composeArgs.push(options.action);
  if (options.action === 'up') {
    // The parse-time guard only sees the explicit --source-build flag. Local image
    // provenance derived from COMPOSE_IMAGE_SOURCE reaches here too, and emitting
    // both flags makes Compose reject the invocation, so fail with the real reason.
    if (sourceBuild && options.composeArguments.includes('--no-build')) {
      fail('COMPOSE_IMAGE_SOURCE=local builds images, so --no-build cannot be passed to up.');
    }
    if (sourceBuild) composeArgs.push('--build');
    else if (!options.composeArguments.includes('--no-build')) composeArgs.push('--no-build');
  }
  composeArgs.push(...options.composeArguments);
  if (options.action !== 'down') composeArgs.push(...actionServices);

  return {
    action: options.action,
    args: composeArgs,
    databaseMode,
    databaseEngine,
    domainMode,
    dryRun: options.dryRun,
    env: composeEnvironment,
    files,
    profiles,
    selectedApps: closure.selectedApps,
    selectedServices,
    publicDomain: baseDomain,
    publicDomainMode,
    imageSource,
    sourceBuild,
    tlsMode,
  };
}

function main() {
  let failureDiagnostic = productionComposeDiagnostics.closureFailure;
  try {
    if (process.env.NRB_CLOSURE_MANIFEST && process.env.NRB_ALL_REFERENCE !== 'true') {
      throw new Error('NRB_CLOSURE_MANIFEST is reserved for the explicit all-reference maintainer validation path.');
    }
    const closureCheck = spawnSync('pnpm', ['nrb', 'closure', 'check'], {
      cwd: rootDir,
      encoding: 'utf8',
    });
    if (closureCheck.status !== 0 && !process.env.NRB_CLOSURE_MANIFEST) {
      throw new Error(
        `Production Compose requires a fresh selected closure: ${(closureCheck.stderr || closureCheck.stdout).trim()}`,
      );
    }
    failureDiagnostic = productionComposeDiagnostics.configurationFailure;
    const invocation = buildComposeInvocation(process.argv.slice(2));
    if (invocation.dryRun) {
      console.log(productionComposeDiagnostics.dryRun);
      return;
    }
    console.error(productionComposeDiagnostics.start);
    failureDiagnostic = productionComposeDiagnostics.executionFailure;
    const result = spawnSync('docker', invocation.args, {
      cwd: rootDir,
      env: invocation.env,
      stdio: 'inherit',
    });
    process.exitCode = composeExecutionStatus(result);
  } catch {
    console.error(failureDiagnostic);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
