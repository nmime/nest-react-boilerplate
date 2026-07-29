#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { derivePublicDomains, parseEnvFile, validateBaseDomain } from './compose-production.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const certificateModes = new Set(['dns-wildcard', 'exact-hosts', 'existing']);
const publicModes = new Set(['single-domain', 'per-app-domains']);
const profiles = new Set(['discord', 'telegram']);
const databaseEngines = new Set(['postgres', 'mongodb']);
const databaseModes = new Set(['bundled-db', 'external-db']);
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

export function loadSingleServerConfiguration({ productionEnv, serverEnv }) {
  const serverPath = resolve(rootDir, serverEnv);
  const productionPath = resolve(rootDir, productionEnv);
  const server = readEnvironment(serverPath, 'Server environment');
  const production = readEnvironment(productionPath, 'Production environment');

  const databaseEngine = production.DATABASE_ENGINE?.trim().toLowerCase() || 'postgres';
  if (!databaseEngines.has(databaseEngine)) fail('DATABASE_ENGINE must be postgres or mongodb.');
  const databaseMode = required(production, 'COMPOSE_DATABASE_MODE', 'the production environment');
  if (!databaseModes.has(databaseMode)) fail('COMPOSE_DATABASE_MODE must be bundled-db or external-db.');

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

  return {
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

function frontendLocations(configuration, frontendPort, includeSingleDomainAuthRoutes = false) {
  const { enabledProfiles, ports } = configuration;
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
    `  location /auth {
    if ($nrb_api_request) { return 418; }
    proxy_pass http://127.0.0.1:${frontendPort};
${proxyHeaders()}
    error_page 418 = @auth_api;
  }`,
    `  location /profile {
    if ($nrb_api_request) { return 418; }
    proxy_pass http://127.0.0.1:${frontendPort};
${proxyHeaders()}
    error_page 418 = @user_api;
  }`,
    proxyLocation('/admin/docs', ports.ADMIN_APP_API_PORT, '= '),
    proxyLocation('/admin/docs/', ports.ADMIN_APP_API_PORT, '^~ '),
    `  location /admin {
    if ($nrb_api_request) { return 418; }
    proxy_pass http://127.0.0.1:${frontendPort};
${proxyHeaders()}
    error_page 418 = @admin_api;
  }`,
    ...(enabledProfiles.includes('telegram')
      ? [
          proxyLocation('/telegram', ports.TELEGRAM_BOT_API_PORT, '= '),
          proxyLocation('/telegram/', ports.TELEGRAM_BOT_API_PORT, '^~ '),
          proxyLocation('/telegram-mini-app', ports.USER_APP_PORT, '= '),
          proxyLocation('/telegram-mini-app/', ports.USER_APP_PORT, '^~ '),
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
    proxyLocation('/', frontendPort),
  ];
  return locations.join('\n\n');
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

  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
  add_header X-Content-Type-Options nosniff always;
  add_header X-Frame-Options SAMEORIGIN always;
  add_header Referrer-Policy strict-origin-when-cross-origin always;

  location = /_infra/health {
    access_log off;
    default_type text/plain;
    return 200 "ok\\n";
  }

${body}
}`;
}

function frontendPort(configuration, appId) {
  const keys = {
    'admin-app': 'ADMIN_APP_PORT',
    'landing-app': 'LANDING_APP_PORT',
    'mobile-app': 'MOBILE_APP_PORT',
    'site-app': 'SITE_APP_PORT',
    'user-app': 'USER_APP_PORT',
  };
  return configuration.ports[keys[appId]];
}

export function renderNginx(configuration, phase = 'https') {
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
    servers.push(tlsServer(configuration, configuration.domain, frontendLocations(configuration, primaryPort, true)));
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
          frontendLocations(configuration, frontendPort(configuration, appId)),
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

export function certificateDomains(configuration) {
  return configuration.certificateMode === 'dns-wildcard'
    ? [configuration.domain, `*.${configuration.domain}`]
    : configuration.publicHosts;
}

function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (!['certificate-domains', 'hosts', 'render-nginx', 'validate'].includes(options.command)) {
      fail(
        'Usage: node scripts/single-server-deployment.mjs <validate|hosts|certificate-domains|render-nginx> [--server-env path] [--production-env path] [--phase http|https] [--output path|-]',
      );
    }
    const configuration = loadSingleServerConfiguration(options);
    if (options.command === 'validate') {
      if (configuration.databaseEngine === 'mongodb' && configuration.databaseMode === 'bundled-db') {
        console.error(
          'WARNING: bundled MongoDB is a single-node replica set for transactions and is not highly available.',
        );
      }
      console.log(
        `single-server configuration valid: database=${configuration.databaseEngine}/${configuration.databaseMode}, domains=${configuration.publicMode}, certificate=${configuration.certificateMode}, hosts=${configuration.publicHosts.length}`,
      );
      return;
    }
    if (options.command === 'hosts') {
      console.log(configuration.publicHosts.join('\n'));
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
