import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildComposeInvocation,
  derivePublicDomains,
  parseEnvFile,
  validateBaseDomain,
} from './compose-production.mjs';

test('parses ordinary and quoted environment values without exposing comments', () => {
  assert.deepEqual(parseEnvFile('A=one\nB="two words"\n# SECRET=no\nC=\'three\'\n'), {
    A: 'one',
    B: 'two words',
    C: 'three',
  });
});

test('derives exact app-id hostnames and keeps landing on the apex by default', () => {
  assert.deepEqual(derivePublicDomains('example.com', 'landing-app'), {
    LANDING_APP_DOMAIN: 'example.com',
    SITE_APP_DOMAIN: 'site-app.example.com',
    USER_APP_DOMAIN: 'user-app.example.com',
    ADMIN_APP_DOMAIN: 'admin-app.example.com',
    MOBILE_APP_DOMAIN: 'mobile-app.example.com',
    AUTH_APP_API_DOMAIN: 'auth-app-api.example.com',
    USER_APP_API_DOMAIN: 'user-app-api.example.com',
    ADMIN_APP_API_DOMAIN: 'admin-app-api.example.com',
    DISCORD_APP_API_DOMAIN: 'discord-app-api.example.com',
    TELEGRAM_BOT_API_DOMAIN: 'telegram-bot-api.example.com',
  });
});

test('can assign the apex to site without changing any API hostname', () => {
  const domains = derivePublicDomains('product.example', 'site-app');
  assert.equal(domains.LANDING_APP_DOMAIN, 'landing-app.product.example');
  assert.equal(domains.SITE_APP_DOMAIN, 'product.example');
  assert.equal(domains.AUTH_APP_API_DOMAIN, 'auth-app-api.product.example');
});

test('rejects schemes, ports, paths, wildcards, and invalid apex owners', () => {
  for (const invalid of ['https://example.com', 'example.com:443', 'example.com/path', '*.example.com', 'localhost']) {
    assert.throws(() => validateBaseDomain(invalid), /PUBLIC_DOMAIN/u);
  }
  assert.throws(() => derivePublicDomains('example.com', 'user-app'), /PRIMARY_APP/u);
});

test('builds the per-app automatic HTTPS topology from the production example', () => {
  const invocation = buildComposeInvocation(['config', '--env-file=.env.production.example'], {});
  assert.equal(invocation.databaseMode, 'bundled-db');
  assert.equal(invocation.domainMode, 'per-app-domains');
  assert.equal(invocation.tlsMode, 'automatic');
  assert.deepEqual(invocation.profiles, []);
  assert.ok(invocation.files.includes('docker/docker-compose.prod.edge.yml'));
  assert.ok(!invocation.files.includes('docker/docker-compose.prod.edge-provided-tls.yml'));
  assert.equal(invocation.env.AUTH_APP_API_DOMAIN, 'auth-app-api.example.com');
  assert.equal(invocation.env.PRIMARY_APP_UPSTREAM, 'landing-app:8080');
  assert.equal(invocation.env.BETTER_AUTH_URL, 'https://user-app.example.com');
  assert.equal(
    invocation.env.AUTH_ALLOWED_RETURN_URLS,
    'https://example.com,https://site-app.example.com,https://user-app.example.com,https://admin-app.example.com,https://mobile-app.example.com',
  );
  assert.match(invocation.env.CORS_ORIGINS, /https:\/\/admin-app\.example\.com/u);
});

test('builds one-host and external-proxy variants without incompatible overlays', () => {
  const single = buildComposeInvocation(
    [
      'up',
      '--env-file=.env.production.example',
      '--database=external-db',
      '--domains=single-domain',
      '--tls=provided',
      '-d',
    ],
    {},
  );
  assert.ok(single.files.includes('docker/docker-compose.prod.external-db.yml'));
  assert.ok(single.files.includes('docker/docker-compose.prod.edge-provided-tls.yml'));
  assert.equal(single.env.CORS_ORIGINS, 'https://example.com');
  assert.equal(single.env.BETTER_AUTH_URL, 'https://example.com');
  assert.equal(single.env.AUTH_ALLOWED_RETURN_URLS, 'https://example.com');

  const siteApex = buildComposeInvocation(
    ['config', '--env-file=.env.production.example', '--domains=single-domain', '--tls=automatic'],
    { PRIMARY_APP: 'site-app', PUBLIC_DOMAIN: 'product.example' },
  );
  assert.equal(siteApex.env.PRIMARY_APP_UPSTREAM, 'site-app:80');
  assert.equal(siteApex.env.SITE_APP_DOMAIN, 'product.example');
  assert.equal(siteApex.env.LANDING_APP_DOMAIN, 'landing-app.product.example');

  const external = buildComposeInvocation(
    ['config', '--env-file=.env.production.example', '--domains=external-proxy', '--tls=external'],
    { EXTERNAL_PROXY_PUBLIC_MODE: '' },
  );
  assert.ok(!external.files.includes('docker/docker-compose.prod.edge.yml'));
  assert.equal(
    external.env.CORS_ORIGINS,
    'https://admin-app.example.com,https://user-app.example.com,https://example.com,https://site-app.example.com,https://mobile-app.example.com',
  );
});

test('keeps same-origin builds free of stale API domains and validates explicit split-origin builds', () => {
  const sameOrigin = buildComposeInvocation(
    ['config', '--env-file=.env.production.example', '--domains=single-domain', '--tls=automatic'],
    {
      VITE_ADMIN_API_BASE_URL: 'https://legacy-admin.example.test',
      VITE_AUTH_API_BASE_URL: 'https://legacy-auth.example.test',
      VITE_USER_API_BASE_URL: 'https://legacy-user.example.test',
    },
  );
  assert.equal(sameOrigin.env.VITE_API_BASE_URL_MODE, 'same-origin');
  assert.equal(sameOrigin.env.VITE_AUTH_API_BASE_URL, '');
  assert.equal(sameOrigin.env.VITE_USER_API_BASE_URL, '');
  assert.equal(sameOrigin.env.VITE_ADMIN_API_BASE_URL, '');

  const splitOrigin = buildComposeInvocation(['config', '--env-file=.env.production.example'], {
    FRONTEND_NGINX_CONFIG: 'docker/nginx-spa.conf',
    VITE_ADMIN_API_BASE_URL: 'https://admin-api.product.example/',
    VITE_API_BASE_URL_MODE: 'split-origin',
    VITE_AUTH_API_BASE_URL: 'https://auth-api.product.example/',
    VITE_USER_API_BASE_URL: 'https://user-api.product.example/',
  });
  assert.equal(splitOrigin.env.FRONTEND_NGINX_CONFIG, 'docker/nginx-spa.conf');
  assert.equal(splitOrigin.env.VITE_AUTH_API_BASE_URL, 'https://auth-api.product.example');

  assert.throws(
    () =>
      buildComposeInvocation(['config', '--env-file=.env.production.example'], {
        FRONTEND_NGINX_CONFIG: 'docker/nginx-spa.conf',
        VITE_API_BASE_URL_MODE: 'split-origin',
        VITE_AUTH_API_BASE_URL: 'https://auth-api.product.example/path',
      }),
    /VITE_AUTH_API_BASE_URL|VITE_USER_API_BASE_URL/u,
  );
});

test('derives external host-proxy runtime URLs from its declared public topology', () => {
  const single = buildComposeInvocation(
    ['config', '--env-file=.env.production.example', '--domains=external-proxy', '--tls=external'],
    { EXTERNAL_PROXY_PUBLIC_MODE: 'single-domain' },
  );
  assert.equal(single.publicDomainMode, 'single-domain');
  assert.equal(single.env.AUTH_JWT_ISSUER, 'https://example.com');
  assert.equal(single.env.BETTER_AUTH_URL, 'https://example.com');
  assert.equal(single.env.CORS_ORIGINS, 'https://example.com');
  assert.equal(single.env.TELEGRAM_MINI_APP_URL, 'https://example.com/telegram-mini-app');

  const perApp = buildComposeInvocation(
    ['config', '--env-file=.env.production.example', '--domains=external-proxy', '--tls=external'],
    { EXTERNAL_PROXY_PUBLIC_MODE: 'per-app-domains' },
  );
  assert.equal(perApp.publicDomainMode, 'per-app-domains');
  assert.equal(perApp.env.AUTH_JWT_ISSUER, 'https://auth-app-api.example.com');
  assert.equal(perApp.env.BETTER_AUTH_URL, 'https://user-app.example.com');
  assert.match(perApp.env.CORS_ORIGINS, /https:\/\/admin-app\.example\.com/u);

  assert.throws(
    () =>
      buildComposeInvocation(
        ['config', '--env-file=.env.production.example', '--domains=external-proxy', '--tls=external'],
        { EXTERNAL_PROXY_PUBLIC_MODE: 'wildcard' },
      ),
    /EXTERNAL_PROXY_PUBLIC_MODE/u,
  );
});

test('wires optional profiles into both services and edge routes', () => {
  const invocation = buildComposeInvocation(
    ['config', '--env-file=.env.production.example', '--profile=telegram,discord'],
    {},
  );
  assert.deepEqual(invocation.profiles, ['discord', 'telegram']);
  assert.equal(invocation.env.EDGE_OPTIONAL_ROUTES, 'discord-telegram');
  assert.equal(invocation.env.AUTH_TELEGRAM_ENABLED, 'true');
  assert.equal(invocation.env.TELEGRAM_OIDC_ENABLED, 'true');
  assert.equal(invocation.env.VITE_TELEGRAM_AUTH_ENABLED, 'true');
  assert.equal(invocation.env.DISCORD_AUTH_ENABLED, 'true');
  assert.ok(invocation.files.includes('docker/docker-compose.prod.telegram.yml'));
  assert.ok(invocation.files.includes('docker/docker-compose.prod.discord.yml'));
  assert.deepEqual(
    invocation.args.filter((item) => item === '--profile'),
    ['--profile', '--profile'],
  );
});

test('rejects TLS ownership mismatches', () => {
  assert.throws(
    () =>
      buildComposeInvocation(
        ['config', '--env-file=.env.production.example', '--domains=external-proxy', '--tls=automatic'],
        {},
      ),
    /external/u,
  );
  assert.throws(
    () =>
      buildComposeInvocation(
        ['config', '--env-file=.env.production.example', '--domains=single-domain', '--tls=external'],
        {},
      ),
    /automatic.*provided/u,
  );
  assert.throws(
    () =>
      buildComposeInvocation(
        [
          'config',
          '--env-file=.env.production.example',
          '--domains=single-domain',
          '--tls=automatic',
          '--profile=telegram',
        ],
        {},
      ),
    /per-app-domains/u,
  );
});
