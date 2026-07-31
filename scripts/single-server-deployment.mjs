#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { derivePublicDomains, parseEnvFile, validateBaseDomain } from './compose-production.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const certificateModes = new Set(['dns-wildcard', 'exact-hosts', 'existing']);
const frontendModes = new Set(['proxy', 'static']);
/**
 * Built SPA output directory per app, relative to the frontend dist root. In
 * `static` mode nginx serves these directly, so no SPA process is needed.
 * `site-app` is deliberately absent: it is Vike SSR and stays a proxied process.
 */
export const frontendDistDirectories = {
  'landing-app': 'landing',
  'user-app': 'app',
  'admin-app': 'admin',
  'mobile-app': 'mobile',
};
const publicModes = new Set(['single-domain', 'per-app-domains']);
export const runtimeModes = new Set(['compose', 'native']);
const profiles = new Set(['discord', 'notification-consumer', 'notification-scheduler', 'telegram']);
const databaseEngines = new Set(['postgres', 'mongodb']);
const databaseModes = new Set(['bundled-db', 'external-db', 'native']);
const appPorts = {
  ADMIN_APP_API_PORT: 3001,
  USER_APP_API_PORT: 3002,
  AUTH_APP_API_PORT: 3003,
  DISCORD_APP_API_PORT: 3007,
  TELEGRAM_BOT_API_PORT: 3013,
  ADMIN_APP_PORT: 4200,
  USER_APP_PORT: 4201,
  LANDING_APP_PORT: 4202,
  SITE_APP_PORT: 4203,
  MOBILE_APP_PORT: 4300,
};
const privateInfrastructurePorts = {
  GRAFANA_PORT: 3000,
  OTEL_COLLECTOR_GRPC_PORT: 4317,
  OTEL_COLLECTOR_HTTP_PORT: 4318,
  OTEL_PROMETHEUS_PORT: 9464,
  PROMETHEUS_PORT: 9090,
  ALERTMANAGER_PORT: 9093,
};

const fail = (message) => {
  throw new Error(message);
};

const splitList = (value) =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const unique = (values) => [...new Set(values)];

function readEnvironment(path, label) {
  if (!existsSync(path)) fail(`${label} file not found: ${path}`);
  return parseEnvFile(readFileSync(path, 'utf8'));
}

function required(environment, key, source) {
  const value = environment[key]?.trim();
  if (!value) fail(`${key} is required in ${source}.`);
  return value;
}

function integer(environment, key, fallback) {
  const raw = environment[key]?.trim() || String(fallback);
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    fail(`${key} must be a TCP port from 1 through 65535.`);
  }
  return value;
}

function parseArguments(argv) {
  const [command, ...raw] = argv;
  const options = {
    command,
    output: '-',
    phase: 'https',
    productionEnv: process.env.NRB_PRODUCTION_ENV || '.env.production',
    serverEnv: process.env.NRB_SERVER_ENV || 'deploy/single-server/server.env',
  };
  for (let index = 0; index < raw.length; index += 1) {
    const argument = raw[index];
    const option = (name) => {
      if (argument === name) {
        const value = raw[index + 1];
        if (!value) fail(`${name} requires a value.`);
        index += 1;
        return value;
      }
      return argument.startsWith(`${name}=`) ? argument.slice(name.length + 1) : undefined;
    };
    const serverEnv = option('--server-env');
    if (serverEnv !== undefined) {
      options.serverEnv = serverEnv;
      continue;
    }
    const productionEnv = option('--production-env');
    if (productionEnv !== undefined) {
      options.productionEnv = productionEnv;
      continue;
    }
    const frontendMode = option('--frontend-mode');
    if (frontendMode !== undefined) {
      options.frontendMode = frontendMode;
      continue;
    }
    const phase = option('--phase');
    if (phase !== undefined) {
      options.phase = phase;
      continue;
    }
    const output = option('--output');
    if (output !== undefined) {
      options.output = output;
      continue;
    }
    fail(`Unknown option: ${argument}`);
  }
  return options;
}

export function loadSingleServerConfiguration({ productionEnv, serverEnv, frontendMode: frontendModeOverride }) {
  const serverPath = resolve(rootDir, serverEnv);
  const productionPath = resolve(rootDir, productionEnv);
  const server = readEnvironment(serverPath, 'Server environment');
  const production = readEnvironment(productionPath, 'Production environment');

  const databaseEngine = production.DATABASE_ENGINE?.trim().toLowerCase() || 'postgres';
  if (!databaseEngines.has(databaseEngine)) fail('DATABASE_ENGINE must be postgres or mongodb.');
  const databaseMode = required(production, 'COMPOSE_DATABASE_MODE', 'the production environment');
  if (!databaseModes.has(databaseMode)) fail('COMPOSE_DATABASE_MODE must be bundled-db, external-db, or native.');

  if (production.COMPOSE_DOMAIN_MODE !== 'external-proxy') {
    fail('COMPOSE_DOMAIN_MODE must be external-proxy for the host Nginx deployment.');
  }
  if (production.COMPOSE_TLS_MODE !== 'external') {
    fail('COMPOSE_TLS_MODE must be external for the host Nginx deployment.');
  }
  const publicMode = required(production, 'EXTERNAL_PROXY_PUBLIC_MODE', 'the production environment');
  if (!publicModes.has(publicMode)) {
    fail('EXTERNAL_PROXY_PUBLIC_MODE must be single-domain or per-app-domains.');
  }
  const domain = validateBaseDomain(required(production, 'PUBLIC_DOMAIN', 'the production environment'));
  const primaryApp = required(production, 'PRIMARY_APP', 'the production environment');
  const domains = derivePublicDomains(domain, primaryApp);
  const enabledProfiles = unique(splitList(production.COMPOSE_PROFILES)).sort();
  for (const profile of enabledProfiles) {
    if (!profiles.has(profile)) fail(`Unsupported COMPOSE_PROFILES entry: ${profile}.`);
  }

  // Which runtime this host supervises. `compose` runs the published images, `native`
  // runs the built workspace under PM2. Defaulted so hosts provisioned before the
  // axis existed keep their Compose behaviour.
  const runtimeMode = (server.RUNTIME_MODE?.trim() || 'compose').toLowerCase();
  if (!runtimeModes.has(runtimeMode)) fail('RUNTIME_MODE must be compose or native.');

  const certificateMode = required(server, 'CERTIFICATE_MODE', 'the server environment');
  if (!certificateModes.has(certificateMode)) {
    fail('CERTIFICATE_MODE must be exact-hosts, dns-wildcard, or existing.');
  }
  const certificateName = server.CERTIFICATE_NAME?.trim() || domain;
  if (!/^[a-zA-Z0-9_.-]+$/u.test(certificateName)) {
    fail('CERTIFICATE_NAME may contain only letters, numbers, dot, underscore, and hyphen.');
  }
  if (certificateMode !== 'existing') {
    const email = required(server, 'CERTBOT_EMAIL', 'the server environment');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) fail('CERTBOT_EMAIL must be a valid email address.');
  }
  if (certificateMode === 'dns-wildcard') {
    const plugin = required(server, 'CERTBOT_DNS_PLUGIN', 'the server environment');
    const packageName = required(server, 'CERTBOT_DNS_PACKAGE', 'the server environment');
    if (!/^[a-z0-9-]+$/u.test(plugin)) fail('CERTBOT_DNS_PLUGIN is invalid.');
    if (!/^[a-z0-9][a-z0-9+.-]*$/u.test(packageName)) fail('CERTBOT_DNS_PACKAGE is invalid.');
    const credentials = required(server, 'CERTBOT_DNS_CREDENTIALS', 'the server environment');
    if (!credentials.startsWith('/')) fail('CERTBOT_DNS_CREDENTIALS must be an absolute path.');
    const propagation = Number(server.CERTBOT_DNS_PROPAGATION_SECONDS?.trim() || '60');
    if (!Number.isInteger(propagation) || propagation < 1) {
      fail('CERTBOT_DNS_PROPAGATION_SECONDS must be a positive integer.');
    }
  }

  const coreHosts = [
    domains.LANDING_APP_DOMAIN,
    domains.SITE_APP_DOMAIN,
    domains.USER_APP_DOMAIN,
    domains.ADMIN_APP_DOMAIN,
    domains.MOBILE_APP_DOMAIN,
    domains.AUTH_APP_API_DOMAIN,
    domains.USER_APP_API_DOMAIN,
    domains.ADMIN_APP_API_DOMAIN,
  ];
  const optionalHosts = [
    ...(enabledProfiles.includes('discord') ? [domains.DISCORD_APP_API_DOMAIN] : []),
    ...(enabledProfiles.includes('telegram') ? [domains.TELEGRAM_BOT_API_DOMAIN] : []),
  ];
  const publicHosts = publicMode === 'single-domain' ? [domain] : unique([...coreHosts, ...optionalHosts]);
  const ports = Object.fromEntries(
    Object.entries(appPorts).map(([key, fallback]) => [key, integer(production, key, fallback)]),
  );
  const activeAppPortKeys = [
    'ADMIN_APP_API_PORT',
    'USER_APP_API_PORT',
    'AUTH_APP_API_PORT',
    'ADMIN_APP_PORT',
    'USER_APP_PORT',
    'LANDING_APP_PORT',
    'SITE_APP_PORT',
    'MOBILE_APP_PORT',
    ...(enabledProfiles.includes('discord') ? ['DISCORD_APP_API_PORT'] : []),
    ...(enabledProfiles.includes('telegram') ? ['TELEGRAM_BOT_API_PORT'] : []),
  ];
  const hostPorts = {
    ...Object.fromEntries(activeAppPortKeys.map((key) => [key, ports[key]])),
    ...Object.fromEntries(
      Object.entries(privateInfrastructurePorts).map(([key, fallback]) => [key, integer(production, key, fallback)]),
    ),
  };
  const portOwners = new Map();
  for (const [key, port] of Object.entries(hostPorts)) {
    if (portOwners.has(port)) fail(`${key} and ${portOwners.get(port)} both publish host port ${port}.`);
    portOwners.set(port, key);
  }
  const certificateDirectory = `/etc/letsencrypt/live/${certificateName}`;
  const clientMaxBodySize = server.NGINX_CLIENT_MAX_BODY_SIZE?.trim() || '10m';
  if (!/^[1-9][0-9]*[kKmMgG]?$/u.test(clientMaxBodySize)) {
    fail('NGINX_CLIENT_MAX_BODY_SIZE must be a positive Nginx size such as 10m.');
  }

  // Frontend serving: `proxy` forwards to SPA processes (containers), `static`
  // serves the built dist tree from disk (native runtimes). Only validate the dist
  // root in static mode so proxy renders keep working from any checkout path.
  const frontendMode = (
    frontendModeOverride ||
    production.EXTERNAL_PROXY_FRONTEND_MODE?.trim() ||
    (runtimeMode === 'native' ? 'static' : 'proxy')
  ).toLowerCase();
  if (!frontendModes.has(frontendMode)) {
    fail('EXTERNAL_PROXY_FRONTEND_MODE must be proxy or static.');
  }
  // The native runtime supervises backend processes and the SSR site only; there is
  // no SPA process for nginx to proxy to, so proxy mode could never come up.
  if (runtimeMode === 'native' && frontendMode !== 'static') {
    fail('RUNTIME_MODE=native serves SPAs from disk; set EXTERNAL_PROXY_FRONTEND_MODE=static.');
  }
  // Single-domain serves every frontend route from the primary bundle, and
  // PRIMARY_APP can only be landing-app or site-app — never the user SPA that owns
  // /telegram-mini-app. Static mode runs no SPA process to proxy that route to, so
  // the Mini App needs the user SPA on its own host.
  if (frontendMode === 'static' && publicMode === 'single-domain' && enabledProfiles.includes('telegram')) {
    fail(
      'The Telegram Mini App is a user-app route, which EXTERNAL_PROXY_PUBLIC_MODE=single-domain cannot serve from the primary bundle; use EXTERNAL_PROXY_PUBLIC_MODE=per-app-domains with EXTERNAL_PROXY_FRONTEND_MODE=static.',
    );
  }
  const configuredDistRoot = production.FRONTEND_DIST_ROOT?.trim();
  const appRoot = server.APP_ROOT?.trim();
  const frontendDistRoot = (configuredDistRoot || `${appRoot || ''}/dist/apps/frontend`).replace(/\/+$/u, '');
  if (frontendMode === 'static') {
    // Without either key the fallback collapses to the literal "/dist/apps/frontend",
    // which is absolute and would pass every check below while serving nothing.
    if (!configuredDistRoot && !appRoot) {
      fail('Static frontend serving requires FRONTEND_DIST_ROOT, or APP_ROOT in the server environment.');
    }
    if (!frontendDistRoot.startsWith('/'))
      fail('FRONTEND_DIST_ROOT must be an absolute path for static frontend serving.');
    // Reject values nginx cannot take literally rather than allowlisting characters.
    if (/[\s;"'$\{\}]/u.test(frontendDistRoot) || frontendDistRoot.split('/').includes('..')) {
      fail('FRONTEND_DIST_ROOT must not contain whitespace, quotes, ;, $, braces, or a .. segment.');
    }
  }

  return {
    frontendMode,
    frontendDistRoot,
    runtimeMode,
    certificateDirectory,
    certificateMode,
    certificateName,
    clientMaxBodySize,
    databaseEngine,
    databaseMode,
    domain,
    domains,
    enabledProfiles,
    hostPorts,
    ports,
    primaryApp,
    production,
    productionPath,
    publicHosts,
    publicMode,
    server,
    serverPath,
  };
}

function proxyHeaders() {
  return `    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Port $server_port;
    proxy_set_header X-Request-ID $request_id;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $nrb_connection_upgrade;
    proxy_read_timeout 90s;
    proxy_send_timeout 90s;`;
}

function proxyLocation(path, port, modifier = '') {
  return `  location ${modifier}${path} {
    proxy_pass http://127.0.0.1:${port};
${proxyHeaders()}
  }`;
}

function namedProxy(name, port) {
  return `  location @${name} {
    proxy_pass http://127.0.0.1:${port};
${proxyHeaders()}
  }`;
}

function frontendLocations(
  configuration,
  frontendPort,
  includeSingleDomainAuthRoutes = false,
  staticDirectory,
  readStaticFile,
) {
  const { enabledProfiles, frontendDistRoot, ports } = configuration;
  // Static mode serves the built bundle from disk, proxy mode forwards to the SPA
  // process. The interleaved routes below share the same handler as `/`, so both
  // shapes must switch together — a static `/` with proxied `/auth` would forward
  // to a process that does not exist in static mode.
  const spaHandler = staticDirectory
    ? `    root ${frontendDistRoot}/${staticDirectory};
    try_files $uri $uri/ /index.html;`
    : `    proxy_pass http://127.0.0.1:${frontendPort};
${proxyHeaders()}`;
  // `return` is rewrite-phase, so the 418 escape hatch still intercepts before the
  // static content handler runs and error_page maps it to the API upstream.
  const spaWithApiFallback = (path, apiName) => `  location ${path} {
    if ($nrb_api_request) { return 418; }
${spaHandler}
    error_page 418 = @${apiName};
  }`;
  const locations = [
    proxyLocation('/api/auth', ports.AUTH_APP_API_PORT, '= '),
    proxyLocation('/api/auth/', ports.AUTH_APP_API_PORT, '^~ '),
    proxyLocation('/auth/docs', ports.AUTH_APP_API_PORT, '= '),
    proxyLocation('/auth/docs/', ports.AUTH_APP_API_PORT, '^~ '),
    ...(includeSingleDomainAuthRoutes
      ? [
          proxyLocation('/auth/discord/callback', ports.AUTH_APP_API_PORT, '= '),
          proxyLocation('/oauth', ports.AUTH_APP_API_PORT, '= '),
          proxyLocation('/oauth/', ports.AUTH_APP_API_PORT, '^~ '),
        ]
      : []),
    spaWithApiFallback('/auth', 'auth_api'),
    spaWithApiFallback('/profile', 'user_api'),
    proxyLocation('/admin/docs', ports.ADMIN_APP_API_PORT, '= '),
    proxyLocation('/admin/docs/', ports.ADMIN_APP_API_PORT, '^~ '),
    spaWithApiFallback('/admin', 'admin_api'),
    ...(enabledProfiles.includes('telegram')
      ? [
          proxyLocation('/telegram', ports.TELEGRAM_BOT_API_PORT, '= '),
          proxyLocation('/telegram/', ports.TELEGRAM_BOT_API_PORT, '^~ '),
          // The Mini App is a client-side route of the user SPA. Gate on the
          // deployment-wide mode, not this host's: static mode starts no SPA
          // process anywhere, so even the SSR host must not proxy to one. The user
          // host serves the route from disk through its history fallback.
          ...(configuration.frontendMode === 'static'
            ? []
            : [
                proxyLocation('/telegram-mini-app', ports.USER_APP_PORT, '= '),
                proxyLocation('/telegram-mini-app/', ports.USER_APP_PORT, '^~ '),
              ]),
        ]
      : []),
    ...(enabledProfiles.includes('discord')
      ? [
          proxyLocation('/discord', ports.DISCORD_APP_API_PORT, '= '),
          proxyLocation('/discord/', ports.DISCORD_APP_API_PORT, '^~ '),
        ]
      : []),
    namedProxy('auth_api', ports.AUTH_APP_API_PORT),
    namedProxy('user_api', ports.USER_APP_API_PORT),
    namedProxy('admin_api', ports.ADMIN_APP_API_PORT),
    // Static mode serves the built SPA from disk; proxy mode forwards to its process.
    staticDirectory
      ? staticFrontendLocation(frontendDistRoot, staticDirectory, readStaticFile)
      : proxyLocation('/', frontendPort),
  ];
  return locations.join('\n\n');
}

/**
 * Response headers every public location must carry.
 *
 * ngx_http_headers_module does not merge `add_header` across levels: a location
 * that declares one discards every inherited header. So any location below that
 * sets Cache-Control has to restate the whole set, or the SPA's HTML and assets
 * would be served without HSTS, nosniff, framing, and referrer protection.
 */
const securityHeaderDirectives = [
  'add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;',
  'add_header X-Content-Type-Options nosniff always;',
  'add_header X-Frame-Options SAMEORIGIN always;',
  'add_header Referrer-Policy strict-origin-when-cross-origin always;',
  // SPA navigations and API calls deliberately share paths such as /admin/roles and
  // are split by negotiated media type, so any shared cache must key on it.
  'add_header Vary Accept always;',
];

/**
 * Content-Security-Policy for served HTML only.
 *
 * It is deliberately not a server-level header: the same vhost proxies Swagger UI at
 * /auth/docs and /admin/docs, which needs inline styles and its own script bundle.
 */
const htmlContentSecurityPolicy = (allowsAstroInlineScripts = false) =>
  `add_header Content-Security-Policy "default-src 'self'; script-src 'self'${
    allowsAstroInlineScripts ? " 'unsafe-inline'" : ''
  }; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; ` +
  `frame-ancestors 'self'; base-uri 'self'; form-action 'self'" always;`;

const securityHeaders = (indent) => securityHeaderDirectives.map((directive) => `${indent}${directive}`).join('\n');

/**
 * Serve a built SPA from disk with history fallback.
 *
 * Immutable caching is scoped to the bundlers' content-hashed output directories
 * (Vite `/assets/`, Expo web `/_expo/`) with `^~` rather than an extension regex:
 * a regex outranks the plain `/auth`, `/profile` and `/admin` prefixes and would
 * answer their API requests from disk, and it would also pin the per-deployment
 * `/runtime-config.js` — which is rewritten in place — for a year.
 */
function staticFrontendLocation(distRoot, directory, readStaticFile) {
  const root = `${distRoot}/${directory}`;
  let allowsAstroInlineScripts = false;
  if (directory === frontendDistDirectories['landing-app']) {
    const indexPath = `${root}/index.html`;
    let indexHtml;
    try {
      indexHtml = readStaticFile(indexPath, 'utf8');
    } catch {
      fail(`Landing static bundle is missing or unreadable: ${indexPath}`);
    }
    const cspMeta = indexHtml
      .match(/<meta\b[^>]*>/giu)
      ?.find((tag) => /\bhttp-equiv\s*=\s*["']content-security-policy["']/iu.test(tag));
    const policy = cspMeta?.match(/\bcontent\s*=\s*(["'])(.*?)\1/isu)?.[2];
    const scriptSources = policy?.match(/(?:^|;)\s*script-src\s+([^;]+)/iu)?.[1];
    if (!scriptSources || !/'sha256-[A-Za-z0-9+/]+=*'/u.test(scriptSources)) {
      fail(`Landing static bundle must contain an Astro script-src hash policy: ${indexPath}`);
    }
    // The generated hash policy intersects with this outer policy, so only its
    // known hydration bootstrap remains executable.
    allowsAstroInlineScripts = true;
  }
  const immutable = (path) => `  location ^~ ${path} {
    root ${root};
    try_files $uri =404;
${securityHeaders('    ')}
    add_header Cache-Control "public, max-age=31536000, immutable" always;
  }`;
  return `  location / {
    root ${root};
    try_files $uri $uri/ /index.html;
  }

  location = /index.html {
    root ${root};
${securityHeaders('    ')}
    ${htmlContentSecurityPolicy(allowsAstroInlineScripts)}
    add_header Cache-Control "no-store" always;
  }

  location = /runtime-config.js {
    root ${root};
    try_files $uri =404;
${securityHeaders('    ')}
    add_header Cache-Control "no-store" always;
  }

${immutable('/assets/')}

${immutable('/_expo/')}`;
}

function tlsServer(configuration, host, body) {
  const { certificateDirectory, clientMaxBodySize } = configuration;
  return `server {
  listen 443 ssl;
  listen [::]:443 ssl;
  http2 on;
  server_name ${host};

  ssl_certificate ${certificateDirectory}/fullchain.pem;
  ssl_certificate_key ${certificateDirectory}/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_session_cache shared:NRBTLS:10m;
  ssl_session_timeout 1d;
  ssl_session_tickets off;
  client_max_body_size ${clientMaxBodySize};

${securityHeaders('  ')}

  location = /_infra/health {
    access_log off;
    default_type text/plain;
    return 200 "ok\\n";
  }

  # Never expose dotfiles or repository metadata, even if a dist root ever contains them.
  location = /.env { return 404; }

  location ^~ /.git/ { return 404; }

${body}
}`;
}

/**
 * The dist directory nginx should serve for an app, or `undefined` when it must be
 * proxied — either because the deployment proxies every frontend, or because the
 * app has no static bundle (site-app is Vike SSR).
 */
function staticDirectoryFor(configuration, appId) {
  return configuration.frontendMode === 'static' ? frontendDistDirectories[appId] : undefined;
}

const frontendPortKeys = {
  'admin-app': 'ADMIN_APP_PORT',
  'landing-app': 'LANDING_APP_PORT',
  'mobile-app': 'MOBILE_APP_PORT',
  'site-app': 'SITE_APP_PORT',
  'user-app': 'USER_APP_PORT',
};

function frontendPort(configuration, appId) {
  return configuration.ports[frontendPortKeys[appId]];
}

export function renderNginx(configuration, phase = 'https', { readStaticFile = readFileSync } = {}) {
  if (!['http', 'https'].includes(phase)) fail('--phase must be http or https.');
  const serverNames = configuration.publicHosts.join(' ');
  const prelude = `# Generated by scripts/single-server-deployment.mjs. Do not edit.
server_names_hash_bucket_size 128;
server_tokens off;
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_types application/json application/javascript application/problem+json application/xml image/svg+xml text/css text/plain;

map $http_upgrade $nrb_connection_upgrade {
  default upgrade;
  '' close;
}

map "$request_method:$http_accept" $nrb_api_request {
  ~^(GET|HEAD):.*text/html 0;
  default 1;
}

server {
  listen 80 default_server;
  listen [::]:80 default_server;
  server_name _;
  return 444;
}

server {
  listen 80;
  listen [::]:80;
  server_name ${serverNames};

  location ^~ /.well-known/acme-challenge/ {
    root /var/www/certbot;
    default_type text/plain;
    try_files $uri =404;
  }

${phase === 'https' ? '  location / { return 301 https://$host$request_uri; }' : '  location / { return 503; }'}
}`;
  if (phase === 'http') return `${prelude}\n`;

  const rejectUnknownTls = `server {
  listen 443 ssl default_server;
  listen [::]:443 ssl default_server;
  server_name _;
  ssl_reject_handshake on;
}`;
  const servers = [];
  if (configuration.publicMode === 'single-domain') {
    const primaryPort = frontendPort(configuration, configuration.primaryApp);
    servers.push(
      tlsServer(
        configuration,
        configuration.domain,
        frontendLocations(
          configuration,
          primaryPort,
          true,
          staticDirectoryFor(configuration, configuration.primaryApp),
          readStaticFile,
        ),
      ),
    );
  } else {
    const frontendEntries = [
      ['landing-app', 'LANDING_APP_DOMAIN'],
      ['site-app', 'SITE_APP_DOMAIN'],
      ['user-app', 'USER_APP_DOMAIN'],
      ['admin-app', 'ADMIN_APP_DOMAIN'],
      ['mobile-app', 'MOBILE_APP_DOMAIN'],
    ];
    for (const [appId, domainKey] of frontendEntries) {
      servers.push(
        tlsServer(
          configuration,
          configuration.domains[domainKey],
          frontendLocations(
            configuration,
            frontendPort(configuration, appId),
            false,
            staticDirectoryFor(configuration, appId),
            readStaticFile,
          ),
        ),
      );
    }
    const apiEntries = [
      ['AUTH_APP_API_DOMAIN', configuration.ports.AUTH_APP_API_PORT],
      ['USER_APP_API_DOMAIN', configuration.ports.USER_APP_API_PORT],
      ['ADMIN_APP_API_DOMAIN', configuration.ports.ADMIN_APP_API_PORT],
      ...(configuration.enabledProfiles.includes('discord')
        ? [['DISCORD_APP_API_DOMAIN', configuration.ports.DISCORD_APP_API_PORT]]
        : []),
      ...(configuration.enabledProfiles.includes('telegram')
        ? [['TELEGRAM_BOT_API_DOMAIN', configuration.ports.TELEGRAM_BOT_API_PORT]]
        : []),
    ];
    for (const [domainKey, port] of apiEntries) {
      servers.push(tlsServer(configuration, configuration.domains[domainKey], proxyLocation('/', port)));
    }
  }
  return `${prelude}\n\n${rejectUnknownTls}\n\n${servers.join('\n\n')}\n`;
}

/**
 * The loopback ports that must have a listener for this exact topology, derived
 * rather than enumerated: the observability stack only exists as Compose services,
 * static mode replaces every SPA process with a dist tree, and the Vike SSR site
 * keeps a process wherever its vhost is rendered.
 */
export function expectedListeningPorts(configuration) {
  const { enabledProfiles, ports, primaryApp, publicMode, runtimeMode } = configuration;
  const keys = ['ADMIN_APP_API_PORT', 'USER_APP_API_PORT', 'AUTH_APP_API_PORT'];
  if (enabledProfiles.includes('discord')) keys.push('DISCORD_APP_API_PORT');
  if (enabledProfiles.includes('telegram')) keys.push('TELEGRAM_BOT_API_PORT');

  // Mirror the render: single-domain only serves the primary app (plus the user SPA
  // when the Mini App route is proxied), per-app-domains serves every frontend. Each
  // of those needs a process only when it is not served from a dist directory.
  const renderedApps =
    publicMode === 'single-domain'
      ? [primaryApp, ...(enabledProfiles.includes('telegram') ? ['user-app'] : [])]
      : ['landing-app', 'site-app', 'user-app', 'admin-app', 'mobile-app'];
  for (const appId of unique(renderedApps)) {
    if (!staticDirectoryFor(configuration, appId)) keys.push(frontendPortKeys[appId]);
  }
  if (runtimeMode === 'compose') keys.push(...Object.keys(privateInfrastructurePorts));
  return unique(keys).map((key) => ({ key, port: configuration.hostPorts[key] ?? ports[key] }));
}

export function certificateDomains(configuration) {
  return configuration.certificateMode === 'dns-wildcard'
    ? [configuration.domain, `*.${configuration.domain}`]
    : configuration.publicHosts;
}

function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (!['certificate-domains', 'expected-ports', 'hosts', 'render-nginx', 'validate'].includes(options.command)) {
      fail(
        'Usage: node scripts/single-server-deployment.mjs <validate|hosts|certificate-domains|expected-ports|render-nginx> [--server-env path] [--production-env path] [--phase http|https] [--frontend-mode proxy|static] [--output path|-]',
      );
    }
    const configuration = loadSingleServerConfiguration(options);
    if (options.command === 'validate') {
      if (configuration.databaseEngine === 'mongodb' && configuration.databaseMode === 'bundled-db') {
        console.error(
          'WARNING: bundled MongoDB is a single-node replica set for transactions and is not highly available.',
        );
      }
      // Name what is served from disk: "static" degrades to a proxy for an SSR
      // primary, and an operator must be able to see that from the output.
      const served = Object.keys(frontendDistDirectories)
        .filter((appId) => staticDirectoryFor(configuration, appId))
        .join(',');
      console.log(
        `single-server configuration valid: runtime=${configuration.runtimeMode}, ` +
          `database=${configuration.databaseEngine}/${configuration.databaseMode}, domains=${configuration.publicMode}, ` +
          `certificate=${configuration.certificateMode}, hosts=${configuration.publicHosts.length}, ` +
          `frontends=${configuration.frontendMode}${served ? ` (from disk: ${served})` : ''}`,
      );
      return;
    }
    if (options.command === 'hosts') {
      console.log(configuration.publicHosts.join('\n'));
      return;
    }
    if (options.command === 'expected-ports') {
      console.log(
        expectedListeningPorts(configuration)
          .map(({ key, port }) => `${key}=${port}`)
          .join('\n'),
      );
      return;
    }
    if (options.command === 'certificate-domains') {
      console.log(certificateDomains(configuration).join('\n'));
      return;
    }
    const rendered = renderNginx(configuration, options.phase);
    if (options.output === '-') process.stdout.write(rendered);
    else writeFileSync(resolve(options.output), rendered, { mode: 0o644 });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
