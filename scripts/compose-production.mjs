#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const defaultEnvFile = '.env.production';
const actions = new Set(['build', 'config', 'down', 'logs', 'ps', 'pull', 'up']);
const databaseModes = new Set(['bundled-db', 'external-db']);
const domainModes = new Set(['external-proxy', 'single-domain', 'per-app-domains']);
const publicDomainModes = new Set(['single-domain', 'per-app-domains']);
const frontendApiBaseUrlModes = new Set(['same-origin', 'split-origin']);
const frontendApiBaseUrlKeys = ['VITE_AUTH_API_BASE_URL', 'VITE_USER_API_BASE_URL', 'VITE_ADMIN_API_BASE_URL'];
const tlsModes = new Set(['automatic', 'provided', 'external']);
const supportedProfiles = new Set(['discord', 'telegram']);
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

function parseArguments(argv) {
  const [action, ...raw] = argv;
  if (!actions.has(action)) {
    fail(`Usage: node scripts/compose-production.mjs <${[...actions].join('|')}> [options]`);
  }
  const options = {
    action,
    databaseMode: undefined,
    domainMode: undefined,
    dryRun: false,
    envFile: defaultEnvFile,
    profiles: [],
    sourceBuild: action === 'build',
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

export function buildComposeInvocation(argv, processEnvironment = process.env) {
  const options = parseArguments(argv);
  const envPath = resolve(rootDir, options.envFile);
  if (!existsSync(envPath)) {
    fail(`Environment file not found: ${options.envFile}. Copy .env.production.example first.`);
  }
  const fileEnvironment = parseEnvFile(readFileSync(envPath, 'utf8'));
  const effectiveEnvironment = { ...fileEnvironment, ...processEnvironment };
  const databaseMode = requireMode(
    options.databaseMode ?? effectiveEnvironment.COMPOSE_DATABASE_MODE,
    databaseModes,
    'COMPOSE_DATABASE_MODE',
  );
  const domainMode = requireMode(
    options.domainMode ?? effectiveEnvironment.COMPOSE_DOMAIN_MODE,
    domainModes,
    'COMPOSE_DOMAIN_MODE',
  );
  const tlsMode = requireMode(options.tlsMode ?? effectiveEnvironment.COMPOSE_TLS_MODE, tlsModes, 'COMPOSE_TLS_MODE');
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

  const profiles = unique([...splitList(effectiveEnvironment.COMPOSE_PROFILES), ...options.profiles]).sort();
  for (const profile of profiles) {
    if (!supportedProfiles.has(profile)) {
      fail(`Unsupported production profile "${profile}". Supported profiles: discord, telegram.`);
    }
  }
  if (domainMode === 'single-domain' && profiles.length > 0) {
    fail(
      'Optional Telegram/Discord profiles require per-app-domains (or an operator-owned external proxy) because their user app and API must both remain publicly reachable.',
    );
  }

  const baseDomain = validateBaseDomain(effectiveEnvironment.PUBLIC_DOMAIN ?? '');
  const primaryApp = effectiveEnvironment.PRIMARY_APP ?? '';
  const domains = derivePublicDomains(baseDomain, primaryApp);
  const configuredExternalPublicMode = effectiveEnvironment.EXTERNAL_PROXY_PUBLIC_MODE?.trim();
  if (configuredExternalPublicMode && !publicDomainModes.has(configuredExternalPublicMode)) {
    fail('EXTERNAL_PROXY_PUBLIC_MODE must be either "single-domain" or "per-app-domains".');
  }
  const publicDomainMode = domainMode === 'external-proxy' ? configuredExternalPublicMode : domainMode;
  const frontendOrigins = [
    'LANDING_APP_DOMAIN',
    'SITE_APP_DOMAIN',
    'USER_APP_DOMAIN',
    'ADMIN_APP_DOMAIN',
    'MOBILE_APP_DOMAIN',
  ].map((key) => `https://${domains[key]}`);
  const exposedOrigins = publicDomainMode === 'single-domain' ? [`https://${baseDomain}`] : frontendOrigins;
  const extraCorsOrigins = splitList(effectiveEnvironment.CORS_EXTRA_ORIGINS);
  const extraTrustedOrigins = splitList(effectiveEnvironment.BETTER_AUTH_EXTRA_TRUSTED_ORIGINS);
  const authOrigin =
    publicDomainMode === 'single-domain' ? `https://${baseDomain}` : `https://${domains.AUTH_APP_API_DOMAIN}`;
  const runtimeDefaults =
    domainMode === 'external-proxy' && !publicDomainMode
      ? {}
      : {
          AUTH_JWT_ISSUER: authOrigin,
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
    COMPOSE_DOMAIN_MODE: domainMode,
    COMPOSE_TLS_MODE: tlsMode,
    ...(domainMode === 'external-proxy' && publicDomainMode ? { EXTERNAL_PROXY_PUBLIC_MODE: publicDomainMode } : {}),
    EDGE_OPTIONAL_ROUTES: profiles.length === 0 ? 'default' : profiles.join('-'),
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
      'AUTH_JWT_ISSUER',
      'BETTER_AUTH_URL',
      'BETTER_AUTH_TRUSTED_ORIGINS',
    ]) {
      composeEnvironment[required] = valueOrDefault(effectiveEnvironment, required, '');
      if (!composeEnvironment[required]) fail(`${required} is required in external-proxy mode.`);
    }
  }

  const files = ['docker/docker-compose.prod.yml', `docker/docker-compose.prod.${databaseMode}.yml`];
  if (profiles.includes('telegram')) files.push('docker/docker-compose.prod.telegram.yml');
  if (profiles.includes('discord')) files.push('docker/docker-compose.prod.discord.yml');
  if (domainMode !== 'external-proxy') files.push('docker/docker-compose.prod.edge.yml');
  if (tlsMode === 'provided') files.push('docker/docker-compose.prod.edge-provided-tls.yml');
  if (options.sourceBuild) files.push('docker/docker-compose.prod.build.yml');

  const composeArgs = ['compose', '--env-file', options.envFile];
  for (const file of files) composeArgs.push('-f', file);
  for (const profile of profiles) composeArgs.push('--profile', profile);
  composeArgs.push(options.action);
  if (options.action === 'up') {
    if (options.sourceBuild) composeArgs.push('--build');
    else if (!options.composeArguments.includes('--no-build')) composeArgs.push('--no-build');
  }
  composeArgs.push(...options.composeArguments);

  return {
    action: options.action,
    args: composeArgs,
    databaseMode,
    domainMode,
    dryRun: options.dryRun,
    env: composeEnvironment,
    files,
    profiles,
    publicDomain: baseDomain,
    publicDomainMode,
    sourceBuild: options.sourceBuild,
    tlsMode,
  };
}

function main() {
  try {
    const invocation = buildComposeInvocation(process.argv.slice(2));
    if (invocation.dryRun) {
      console.log(
        JSON.stringify(
          {
            action: invocation.action,
            command: ['docker', ...invocation.args],
            databaseMode: invocation.databaseMode,
            domainMode: invocation.domainMode,
            profiles: invocation.profiles,
            publicDomain: invocation.publicDomain,
            publicDomainMode: invocation.publicDomainMode,
            sourceBuild: invocation.sourceBuild,
            tlsMode: invocation.tlsMode,
          },
          null,
          2,
        ),
      );
      return;
    }
    console.error(
      `Production Compose: database=${invocation.databaseMode}, domains=${invocation.domainMode}, tls=${invocation.tlsMode}, profiles=${invocation.profiles.join(',') || 'none'}`,
    );
    const result = spawnSync('docker', invocation.args, {
      cwd: rootDir,
      env: invocation.env,
      stdio: 'inherit',
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
