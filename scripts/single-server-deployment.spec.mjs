// @requirements REQ-RUNTIME-DELIVERY-009
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  certificateDomains,
  expectedListeningPorts,
  loadSingleServerConfiguration,
  renderNginx,
} from './single-server-deployment.mjs';

const fixture = ({
  certificateMode = 'exact-hosts',
  primaryApp = 'landing-app',
  profiles = '',
  publicMode = 'per-app-domains',
  frontendMode,
  runtimeMode,
  distRoot = '/srv/nrb/dist/apps/frontend',
} = {}) => {
  const directory = mkdtempSync(join(tmpdir(), 'nrb-single-server-'));
  const serverEnv = join(directory, 'server.env');
  const productionEnv = join(directory, '.env.production');
  writeFileSync(
    serverEnv,
    [
      `CERTIFICATE_MODE=${certificateMode}`,
      'CERTIFICATE_NAME=product.example',
      'CERTBOT_EMAIL=ops@product.example',
      'CERTBOT_DNS_PLUGIN=cloudflare',
      ['CERTBOT_DNS_PACKAGE', 'python3-certbot-dns-cloudflare'].join('='),
      ['CERTBOT_DNS_CREDENTIALS', '/etc/letsencrypt/cloudflare.ini'].join('='),
      ...(runtimeMode ? [`RUNTIME_MODE=${runtimeMode}`] : []),
    ].join('\n'),
  );
  writeFileSync(
    productionEnv,
    [
      'PUBLIC_DOMAIN=product.example',
      `PRIMARY_APP=${primaryApp}`,
      'COMPOSE_DOMAIN_MODE=external-proxy',
      'COMPOSE_TLS_MODE=external',
      `EXTERNAL_PROXY_PUBLIC_MODE=${publicMode}`,
      `COMPOSE_PROFILES=${profiles}`,
      'ADMIN_APP_API_PORT=3101',
      'USER_APP_API_PORT=3102',
      'AUTH_APP_API_PORT=3103',
      'DISCORD_APP_API_PORT=3107',
      'TELEGRAM_BOT_API_PORT=3113',
      'ADMIN_APP_PORT=4100',
      'USER_APP_PORT=4101',
      'LANDING_APP_PORT=4102',
      'SITE_APP_PORT=4103',
      'MOBILE_APP_PORT=4104',
      `FRONTEND_DIST_ROOT=${distRoot}`,
      ...(frontendMode ? [`EXTERNAL_PROXY_FRONTEND_MODE=${frontendMode}`] : []),
    ].join('\n'),
  );
  const configuration = loadSingleServerConfiguration({ productionEnv, serverEnv });
  return {
    configuration,
    cleanup: () => rmSync(directory, { force: true, recursive: true }),
  };
};

test('derives every exact app-id host and only enables selected optional APIs', (context) => {
  const { configuration, cleanup } = fixture({ profiles: 'telegram,discord' });
  context.after(cleanup);
  assert.deepEqual(configuration.publicHosts, [
    'product.example',
    'site-app.product.example',
    'user-app.product.example',
    'admin-app.product.example',
    'mobile-app.product.example',
    'auth-app-api.product.example',
    'user-app-api.product.example',
    'admin-app-api.product.example',
    'discord-app-api.product.example',
    'telegram-bot-api.product.example',
  ]);
  assert.deepEqual(certificateDomains(configuration), configuration.publicHosts);
});

test('renders a single-domain site owner with canonical same-origin APIs and bot routes', (context) => {
  const { configuration, cleanup } = fixture({
    primaryApp: 'site-app',
    profiles: 'telegram,discord',
    publicMode: 'single-domain',
  });
  context.after(cleanup);
  const nginx = renderNginx(configuration, 'https');
  assert.deepEqual(configuration.publicHosts, ['product.example']);
  assert.match(nginx, /server_name product\.example;/u);
  assert.match(nginx, /location \/ \{\n    proxy_pass http:\/\/127\.0\.0\.1:4103;/u);
  assert.match(nginx, /location = \/api\/auth/u);
  assert.match(nginx, /location = \/oauth/u);
  assert.match(nginx, /location = \/telegram-mini-app/u);
  assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:4101;/u);
  assert.match(nginx, /location = \/discord/u);
  assert.doesNotMatch(nginx, /server_name site-app\.product\.example/u);
});

test('renders separate frontend and API virtual hosts using loopback-only upstreams', (context) => {
  const { configuration, cleanup } = fixture();
  context.after(cleanup);
  const nginx = renderNginx(configuration, 'https');
  assert.match(nginx, /server_name auth-app-api\.product\.example;/u);
  assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:3103;/u);
  assert.match(nginx, /server_name admin-app\.product\.example;/u);
  assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:4100;/u);
  assert.match(nginx, /ssl_protocols TLSv1\.2 TLSv1\.3;/u);
  assert.match(nginx, /listen 80 default_server;/u);
  assert.match(nginx, /listen 443 ssl default_server;/u);
  assert.match(nginx, /ssl_reject_handshake on;/u);
  assert.match(nginx, /Strict-Transport-Security/u);
  assert.match(nginx, /location = \/_infra\/health/u);
  assert.doesNotMatch(nginx, /discord-app-api\.product\.example/u);
  assert.doesNotMatch(nginx, /telegram-bot-api\.product\.example/u);
  assert.doesNotMatch(nginx, /location = \/oauth/u);
  assert.doesNotMatch(nginx, /proxy_pass http:\/\/(?!127\.0\.0\.1)/u);
  assert.doesNotMatch(nginx, /X-Forwarded-For \$proxy_add_x_forwarded_for/u);
});

test('renders an HTTP-only ACME bootstrap without referencing a missing certificate', (context) => {
  const { configuration, cleanup } = fixture();
  context.after(cleanup);
  const nginx = renderNginx(configuration, 'http');
  assert.match(nginx, /\.well-known\/acme-challenge/u);
  assert.match(nginx, /return 503/u);
  assert.doesNotMatch(nginx, /listen 443/u);
  assert.doesNotMatch(nginx, /ssl_certificate/u);
});

test('requests apex and wildcard SANs only in DNS wildcard certificate mode', (context) => {
  const { configuration, cleanup } = fixture({ certificateMode: 'dns-wildcard' });
  context.after(cleanup);
  assert.deepEqual(certificateDomains(configuration), ['product.example', '*.product.example']);
});

test('uses a wildcard certificate for exact per-app hosts without accepting arbitrary wildcard hosts', (context) => {
  const { configuration, cleanup } = fixture({ certificateMode: 'dns-wildcard', profiles: 'telegram,discord' });
  context.after(cleanup);
  const nginx = renderNginx(configuration, 'https');
  assert.deepEqual(certificateDomains(configuration), ['product.example', '*.product.example']);
  assert.ok(configuration.publicHosts.includes('auth-app-api.product.example'));
  assert.ok(configuration.publicHosts.includes('telegram-bot-api.product.example'));
  assert.match(nginx, /server_name auth-app-api\.product\.example;/u);
  assert.doesNotMatch(nginx, /server_name \*\.product\.example;/u);
  assert.match(nginx, /ssl_reject_handshake on;/u);
});

test('rejects a Compose-owned edge and unsupported public modes', (context) => {
  const first = fixture();
  context.after(first.cleanup);
  writeFileSync(
    first.configuration.productionPath,
    'PUBLIC_DOMAIN=product.example\nPRIMARY_APP=landing-app\nCOMPOSE_DOMAIN_MODE=per-app-domains\nCOMPOSE_TLS_MODE=automatic\nEXTERNAL_PROXY_PUBLIC_MODE=per-app-domains\n',
  );
  assert.throws(
    () =>
      loadSingleServerConfiguration({
        productionEnv: first.configuration.productionPath,
        serverEnv: first.configuration.serverPath,
      }),
    /external-proxy/u,
  );

  const second = fixture();
  context.after(second.cleanup);
  writeFileSync(
    second.configuration.productionPath,
    'PUBLIC_DOMAIN=product.example\nPRIMARY_APP=landing-app\nCOMPOSE_DOMAIN_MODE=external-proxy\nCOMPOSE_TLS_MODE=external\nEXTERNAL_PROXY_PUBLIC_MODE=implicit\n',
  );
  assert.throws(
    () =>
      loadSingleServerConfiguration({
        productionEnv: second.configuration.productionPath,
        serverEnv: second.configuration.serverPath,
      }),
    /EXTERNAL_PROXY_PUBLIC_MODE/u,
  );

  const third = fixture();
  context.after(third.cleanup);
  writeFileSync(
    third.configuration.productionPath,
    'PUBLIC_DOMAIN=product.example\nPRIMARY_APP=landing-app\nCOMPOSE_DOMAIN_MODE=external-proxy\nCOMPOSE_TLS_MODE=external\nEXTERNAL_PROXY_PUBLIC_MODE=per-app-domains\nADMIN_APP_PORT=3000\n',
  );
  assert.throws(
    () =>
      loadSingleServerConfiguration({
        productionEnv: third.configuration.productionPath,
        serverEnv: third.configuration.serverPath,
      }),
    /both publish host port 3000/u,
  );
});

test('rejects invalid Certbot identity and DNS propagation settings', (context) => {
  const email = fixture();
  context.after(email.cleanup);
  writeFileSync(
    email.configuration.serverPath,
    'CERTIFICATE_MODE=exact-hosts\nCERTIFICATE_NAME=product.example\nCERTBOT_EMAIL=invalid\n',
  );
  assert.throws(
    () =>
      loadSingleServerConfiguration({
        productionEnv: email.configuration.productionPath,
        serverEnv: email.configuration.serverPath,
      }),
    /CERTBOT_EMAIL/u,
  );

  const dns = fixture({ certificateMode: 'dns-wildcard' });
  context.after(dns.cleanup);
  writeFileSync(
    dns.configuration.serverPath,
    [
      'CERTIFICATE_MODE=dns-wildcard',
      'CERTIFICATE_NAME=product.example',
      'CERTBOT_EMAIL=ops@product.example',
      'CERTBOT_DNS_PLUGIN=cloudflare',
      ['CERTBOT_DNS_PACKAGE', 'python3-certbot-dns-cloudflare'].join('='),
      ['CERTBOT_DNS_CREDENTIALS', '/etc/letsencrypt/cloudflare.ini'].join('='),
      'CERTBOT_DNS_PROPAGATION_SECONDS=0',
    ].join('\n'),
  );
  assert.throws(
    () =>
      loadSingleServerConfiguration({
        productionEnv: dns.configuration.productionPath,
        serverEnv: dns.configuration.serverPath,
      }),
    /CERTBOT_DNS_PROPAGATION_SECONDS/u,
  );
});

test('static frontend mode serves built SPAs from disk with history fallback', () => {
  const { configuration, cleanup } = fixture({ frontendMode: 'static' });
  try {
    const nginx = renderNginx(configuration, 'https');
    // Each SPA is served from its own dist directory, not proxied to a process.
    for (const directory of ['landing', 'app', 'admin', 'mobile']) {
      assert.ok(
        nginx.includes(`root /srv/nrb/dist/apps/frontend/${directory};`),
        `${directory} must be served from disk`,
      );
    }
    assert.match(nginx, /try_files \$uri \$uri\/ \/index\.html;/u, 'SPA history fallback is required');
    assert.match(nginx, /Cache-Control "no-store"/u, 'index.html must never be cached');
    assert.match(nginx, /location \^~ \/assets\/ \{/u, 'only hashed output is cached hard');
    assert.match(nginx, /max-age=31536000, immutable/u, 'hashed assets should be cached hard');
    // The runtime config is rewritten per deployment, so it must not inherit the
    // immutable asset policy, and no extension regex may outrank the API prefixes.
    assert.match(nginx, /location = \/runtime-config\.js \{/u);
    assert.doesNotMatch(nginx, /location ~\* \\\./u, 'an extension regex would shadow /auth, /profile and /admin');
    // add_header does not merge across levels: a location that sets Cache-Control
    // discards every inherited header, so each must restate the security set.
    const indexBlock = nginx.slice(nginx.indexOf('location = /index.html {'));
    for (const header of ['Strict-Transport-Security', 'X-Content-Type-Options', 'X-Frame-Options', 'Vary Accept']) {
      assert.ok(indexBlock.slice(0, 700).includes(header), `index.html must keep ${header}`);
    }
    assert.match(indexBlock.slice(0, 900), /Content-Security-Policy/u, 'served HTML must carry a CSP');
    const assetBlock = nginx.slice(nginx.indexOf('location ^~ /assets/ {'));
    assert.ok(assetBlock.slice(0, 600).includes('X-Content-Type-Options'), 'assets must keep nosniff');
    // Swagger UI is proxied on the same vhost and would break under the SPA CSP.
    const docsBlock = nginx.slice(nginx.indexOf('location ^~ /auth/docs/ {'));
    assert.ok(
      !docsBlock.slice(0, 600).includes('Content-Security-Policy'),
      'the API docs must not inherit the SPA CSP',
    );
    assert.match(nginx, /location = \/\.env \{ return 404; \}/u);
    assert.match(nginx, /location \^~ \/\.git\/ \{ return 404; \}/u);
    // The SSR site keeps its process, and APIs stay proxied to loopback.
    assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:4103;/u, 'site-app remains an SSR proxy');
    assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:3103;/u, 'auth API remains proxied');
  } finally {
    cleanup();
  }
});

test('proxy frontend mode remains the default and never serves from disk', () => {
  const { configuration, cleanup } = fixture();
  try {
    assert.equal(configuration.frontendMode, 'proxy');
    const nginx = renderNginx(configuration, 'https');
    assert.ok(!nginx.includes('/srv/nrb/dist/apps/frontend'), 'proxy mode must not reference a dist tree');
    assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:4102;/u, 'landing stays proxied');
  } finally {
    cleanup();
  }
});

test('static frontend mode never leaves an SPA route pointing at a process that does not exist', () => {
  const { configuration, cleanup } = fixture({ frontendMode: 'static', profiles: 'telegram' });
  try {
    const nginx = renderNginx(configuration, 'https');
    // /auth, /profile and /admin share the `/` handler, so they must be served from
    // disk too — proxying them would reach an SPA process static mode never starts.
    assert.doesNotMatch(nginx, /proxy_pass http:\/\/127\.0\.0\.1:4(100|101|102|104);/u);
    for (const route of ['/auth', '/profile', '/admin']) {
      const block = nginx.slice(nginx.indexOf(`location ${route} {`));
      assert.match(block.slice(0, 220), /try_files \$uri \$uri\/ \/index\.html;/u, `${route} must be served from disk`);
    }
    // The 418 API escape hatches survive the switch to a static handler.
    assert.match(nginx, /error_page 418 = @auth_api;/u);
    assert.match(nginx, /error_page 418 = @user_api;/u);
    assert.match(nginx, /error_page 418 = @admin_api;/u);
    // The Mini App is a user-SPA route; nothing proxies it in static mode.
    assert.doesNotMatch(nginx, /location = \/telegram-mini-app/u);
    assert.match(nginx, /location = \/telegram /u, 'the bot API stays proxied');
    assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:4103;/u, 'the SSR site keeps its process');
  } finally {
    cleanup();
  }
});

test('static frontend mode supports the single-domain layout from the primary bundle', () => {
  const { configuration, cleanup } = fixture({ frontendMode: 'static', publicMode: 'single-domain' });
  try {
    const nginx = renderNginx(configuration, 'https');
    assert.deepEqual(configuration.publicHosts, ['product.example']);
    assert.ok(nginx.includes('root /srv/nrb/dist/apps/frontend/landing;'), 'the primary bundle is served from disk');
    // Single-domain keeps its extra same-origin auth routes and the API fallbacks.
    assert.match(nginx, /location = \/oauth/u);
    assert.match(nginx, /error_page 418 = @admin_api;/u);
    assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:3103;/u, 'same-origin APIs stay proxied');
    assert.doesNotMatch(nginx, /proxy_pass http:\/\/127\.0\.0\.1:410[0-4];/u, 'no SPA process is used');
    // Only the primary bundle is reachable, so no other dist tree is exposed.
    for (const directory of ['app', 'admin', 'mobile']) {
      assert.ok(!nginx.includes(`/srv/nrb/dist/apps/frontend/${directory};`), `${directory} must not be served here`);
    }
  } finally {
    cleanup();
  }
});

test('single-domain static keeps an SSR primary proxied instead of serving it from disk', () => {
  const { configuration, cleanup } = fixture({
    frontendMode: 'static',
    publicMode: 'single-domain',
    primaryApp: 'site-app',
  });
  try {
    const nginx = renderNginx(configuration, 'https');
    assert.match(nginx, /location \/ \{\n    proxy_pass http:\/\/127\.0\.0\.1:4103;/u);
    assert.ok(!nginx.includes('/srv/nrb/dist/apps/frontend/'), 'Vike SSR has no static bundle to serve');
  } finally {
    cleanup();
  }
});

test('single-domain static refuses the telegram profile it cannot serve', () => {
  // PRIMARY_APP is landing-app or site-app only, so the single public host can never
  // be the user SPA that owns /telegram-mini-app, and static mode runs no SPA process.
  assert.throws(
    () => fixture({ frontendMode: 'static', publicMode: 'single-domain', profiles: 'telegram' }),
    /per-app-domains/u,
  );
  assert.throws(
    () =>
      fixture({ frontendMode: 'static', publicMode: 'single-domain', primaryApp: 'site-app', profiles: 'telegram' }),
    /per-app-domains/u,
  );
});

const portKeys = (configuration) =>
  expectedListeningPorts(configuration)
    .map(({ key }) => key)
    .sort();

test('expected listening ports cover the Compose topology exactly', () => {
  const { configuration, cleanup } = fixture({ profiles: 'telegram,discord' });
  try {
    // Compose publishes every SPA process and the whole observability stack.
    assert.deepEqual(portKeys(configuration), [
      'ADMIN_APP_API_PORT',
      'ADMIN_APP_PORT',
      'ALERTMANAGER_PORT',
      'AUTH_APP_API_PORT',
      'DISCORD_APP_API_PORT',
      'GRAFANA_PORT',
      'LANDING_APP_PORT',
      'MOBILE_APP_PORT',
      'OTEL_COLLECTOR_GRPC_PORT',
      'OTEL_COLLECTOR_HTTP_PORT',
      'OTEL_PROMETHEUS_PORT',
      'PROMETHEUS_PORT',
      'SITE_APP_PORT',
      'TELEGRAM_BOT_API_PORT',
      'USER_APP_API_PORT',
      'USER_APP_PORT',
    ]);
    assert.deepEqual(
      expectedListeningPorts(configuration).find(({ key }) => key === 'AUTH_APP_API_PORT'),
      { key: 'AUTH_APP_API_PORT', port: 3103 },
      'ports come from the configured values, not the defaults',
    );
  } finally {
    cleanup();
  }
});

test('the native runtime expects no observability or SPA listeners', () => {
  const { configuration, cleanup } = fixture({ runtimeMode: 'native' });
  try {
    assert.equal(configuration.frontendMode, 'static', 'native defaults to serving SPAs from disk');
    // Only the APIs and the Vike SSR site run as processes.
    assert.deepEqual(portKeys(configuration), [
      'ADMIN_APP_API_PORT',
      'AUTH_APP_API_PORT',
      'SITE_APP_PORT',
      'USER_APP_API_PORT',
    ]);
  } finally {
    cleanup();
  }
});

test('a single-domain native host expects only the primary listener it renders', () => {
  const { configuration, cleanup } = fixture({ runtimeMode: 'native', publicMode: 'single-domain' });
  try {
    // The landing bundle is served from disk, so nothing but the APIs listens.
    assert.deepEqual(portKeys(configuration), ['ADMIN_APP_API_PORT', 'AUTH_APP_API_PORT', 'USER_APP_API_PORT']);
  } finally {
    cleanup();
  }

  const ssr = fixture({ runtimeMode: 'native', publicMode: 'single-domain', primaryApp: 'site-app' });
  try {
    assert.ok(portKeys(ssr.configuration).includes('SITE_APP_PORT'), 'an SSR primary keeps its process');
  } finally {
    ssr.cleanup();
  }
});

test('the native runtime refuses to proxy SPAs it never starts', () => {
  assert.throws(() => fixture({ runtimeMode: 'native', frontendMode: 'proxy' }), /static/u);
  assert.throws(() => fixture({ runtimeMode: 'kubernetes' }), /RUNTIME_MODE/u);
});

test('accepts every profile the Compose wrapper supports and publishes only the edge ones', () => {
  const { configuration, cleanup } = fixture({ profiles: 'notification-consumer,notification-scheduler' });
  try {
    // serverctl validates notification secrets for these profiles, so rejecting them
    // here made the notification workers impossible to deploy on a single server.
    assert.deepEqual(configuration.enabledProfiles, ['notification-consumer', 'notification-scheduler']);
    const nginx = renderNginx(configuration, 'https');
    assert.doesNotMatch(nginx, /notification/u, 'notification workers have no public surface');
    assert.ok(!portKeys(configuration).includes('TELEGRAM_BOT_API_PORT'));
  } finally {
    cleanup();
  }
});

test('static frontend mode rejects an unsafe dist root', () => {
  assert.throws(() => fixture({ frontendMode: 'static', distRoot: '/srv/a b' }), /whitespace/u);
  assert.throws(() => fixture({ frontendMode: 'static', distRoot: '/srv/../etc' }), /\.\./u);
  assert.throws(() => fixture({ frontendMode: 'static', distRoot: 'relative/path' }), /absolute/u);
});
