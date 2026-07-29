import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { certificateDomains, loadSingleServerConfiguration, renderNginx } from './single-server-deployment.mjs';

const fixture = ({
  certificateMode = 'exact-hosts',
  databaseEngine = 'postgres',
  databaseMode = 'bundled-db',
  primaryApp = 'landing-app',
  profiles = '',
  publicMode = 'per-app-domains',
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
    ].join('\n'),
  );
  writeFileSync(
    productionEnv,
    [
      'PUBLIC_DOMAIN=product.example',
      `PRIMARY_APP=${primaryApp}`,
      `DATABASE_ENGINE=${databaseEngine}`,
      `COMPOSE_DATABASE_MODE=${databaseMode}`,
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
    ].join('\n'),
  );
  const configuration = loadSingleServerConfiguration({ productionEnv, serverEnv });
  return {
    configuration,
    cleanup: () => rmSync(directory, { force: true, recursive: true }),
  };
};

test('accepts all database engine and ownership combinations independently', (context) => {
  for (const databaseEngine of ['postgres', 'mongodb']) {
    for (const databaseMode of ['bundled-db', 'external-db']) {
      const current = fixture({ databaseEngine, databaseMode });
      context.after(current.cleanup);
      assert.equal(current.configuration.databaseEngine, databaseEngine);
      assert.equal(current.configuration.databaseMode, databaseMode);
    }
  }
});

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
    'PUBLIC_DOMAIN=product.example\nPRIMARY_APP=landing-app\nDATABASE_ENGINE=postgres\nCOMPOSE_DATABASE_MODE=bundled-db\nCOMPOSE_DOMAIN_MODE=per-app-domains\nCOMPOSE_TLS_MODE=automatic\nEXTERNAL_PROXY_PUBLIC_MODE=per-app-domains\n',
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
    'PUBLIC_DOMAIN=product.example\nPRIMARY_APP=landing-app\nDATABASE_ENGINE=postgres\nCOMPOSE_DATABASE_MODE=bundled-db\nCOMPOSE_DOMAIN_MODE=external-proxy\nCOMPOSE_TLS_MODE=external\nEXTERNAL_PROXY_PUBLIC_MODE=implicit\n',
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
    'PUBLIC_DOMAIN=product.example\nPRIMARY_APP=landing-app\nDATABASE_ENGINE=postgres\nCOMPOSE_DATABASE_MODE=bundled-db\nCOMPOSE_DOMAIN_MODE=external-proxy\nCOMPOSE_TLS_MODE=external\nEXTERNAL_PROXY_PUBLIC_MODE=per-app-domains\nADMIN_APP_PORT=3000\n',
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
