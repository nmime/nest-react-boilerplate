// @requirements REQ-RUNTIME-DELIVERY-009
// Real Nginx responses plus a private Fastify cookie fixture. This proves edge
// transport and caching, not a real provider login or Better Auth revocation.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import https from 'node:https';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseAllDocuments } from 'yaml';
import { readRouteTable, renderNginxFullstackConfig } from './generate-nginx-config.mjs';
import { loadSingleServerConfiguration, renderNginx } from './single-server-deployment.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const exec = (command, args) =>
  execFileSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 120000,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
const docker = (...args) => exec('docker', args);
const image = /^FROM (nginxinc\/nginx-unprivileged:\S+) AS frontend$/mu.exec(
  readFileSync(join(root, 'Dockerfile'), 'utf8'),
)?.[1];
assert.ok(image, 'the fixture must use the declared immutable frontend image');

function httpGet(url, headers) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { headers, timeout: 5000 }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () =>
        resolve(new Response(Buffer.concat(chunks), { status: response.statusCode, headers: response.headers })),
      );
      response.on('error', reject);
    });
    request.on('timeout', () => request.destroy(new Error('Owned HTTP timeout')));
    request.on('error', reject);
  });
}

async function waitFor(url, headers) {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await httpGet(url, headers);
      if (response.ok) return;
    } catch {
      /* Starting owned fixture. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Owned Nginx did not become ready: ${url}`);
}
function tlsGet(url, ca) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { ca, timeout: 5000 }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () =>
        resolve({
          status: response.statusCode,
          headers: response.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        }),
      );
      response.on('error', reject);
    });
    request.on('timeout', () => request.destroy(new Error('Owned edge timeout')));
    request.on('error', reject);
  });
}
function assertHeaders(response) {
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.match(response.headers.get('content-security-policy') ?? '', /default-src 'self'/u);
}

test(
  'shipped Compose, standalone, and Helm Nginx retain headers, cache only fingerprints, and preserve trusted HTTPS',
  { timeout: 180000 },
  async () => {
    const directory = mkdtempSync(join(tmpdir(), 'nrb-nginx-runtime-'));
    const suffix = randomUUID().slice(0, 8);
    const network = `nrb-nginx-${suffix}`;
    const backend = `nrb-nginx-backend-${suffix}`;
    const frontend = `nrb-nginx-frontend-${suffix}`;
    let createdNetwork = false;
    try {
      chmodSync(directory, 0o755);
      const html = join(directory, 'html');
      mkdirSync(join(html, 'assets'), { recursive: true, mode: 0o755 });
      for (const [name, content] of [
        ['index.html', '<!doctype html><title>Owned edge fixture</title>'],
        ['runtime-config.js', 'window.__APP_RUNTIME_CONFIG__ = {};'],
        ['assets/app-Ab12Cd34.js', 'console.log(1);'],
        ['logo.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>'],
        ['plain.js', 'console.log(2);'],
      ]) {
        writeFileSync(join(html, name), content, { mode: 0o644 });
      }
      exec('openssl', [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-days',
        '1',
        '-subj',
        '/CN=localhost',
        '-addext',
        'subjectAltName=DNS:localhost,IP:127.0.0.1',
        '-keyout',
        join(directory, 'key.pem'),
        '-out',
        join(directory, 'cert.pem'),
      ]);
      chmodSync(join(directory, 'key.pem'), 0o600);
      writeFileSync(
        join(directory, 'backend.cjs'),
        `
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const appRequire = require('node:module').createRequire('/app/package.json');
const fastify = appRequire('fastify')({trustProxy: true});
(async () => {
  await fastify.register(appRequire('@fastify/cookie'));
  await fastify.register(appRequire('@fastify/session'), {secret: 'owned-session-protocol-test-material'.repeat(2), cookie: {secure: true, httpOnly: true, sameSite: 'lax'}});
  fastify.get('/api/auth/edge-session', async (request) => {request.session.owned = true; return {protocol: request.protocol};});
  await fastify.listen({port: 3000, host: '0.0.0.0'});
  https.createServer({key: fs.readFileSync('/fixture/key.pem'), cert: fs.readFileSync('/fixture/cert.pem')}, (request, response) => {
    const upstream = http.request({hostname: 'frontend', port: 8080, path: request.url, method: request.method,
      headers: {...request.headers, 'x-forwarded-proto': 'https'}}, (incoming) => {response.writeHead(incoming.statusCode, incoming.headers); incoming.pipe(response);});
    upstream.on('error', () => {response.writeHead(502); response.end();}); request.pipe(upstream);
  }).listen(3443, '0.0.0.0');
})().catch((error) => {console.error('fixture-startup', error.name, error.code ?? 'unknown'); process.exit(1);});
`,
      );
      docker('network', 'create', network);
      createdNetwork = true;
      const backendImage = process.env.NRB_NGINX_BACKEND_IMAGE || 'nrb/auth-app-api:local';
      docker(
        'run',
        '-d',
        '--name',
        backend,
        '--network',
        network,
        '--network-alias',
        'backend',
        '--user',
        '0:0',
        '--read-only',
        '--cap-drop',
        'ALL',
        '--cap-add',
        'NET_BIND_SERVICE',
        '--security-opt',
        'no-new-privileges:true',
        '--tmpfs',
        '/tmp',
        '-p',
        '127.0.0.1::3443',
        '-v',
        `${directory}:/fixture:ro`,
        '--entrypoint',
        'node',
        backendImage,
        '/fixture/backend.cjs',
      );
      const backendIp = JSON.parse(docker('inspect', '--format', '{{json .NetworkSettings.Networks}}', backend))[
        network
      ].IPAddress;
      writeFileSync(join(directory, 'trusted.conf'), `${backendIp}/32 1;\n`);
      const backendPorts = JSON.parse(docker('inspect', '--format', '{{json .NetworkSettings.Ports}}', backend));
      assert.ok(
        backendPorts['3443/tcp']?.[0]?.HostPort,
        `Owned backend published no TLS port: ${docker('inspect', '--format', '{{json .State}}', backend)} ${docker('logs', backend)}`,
      );
      const tlsPort = backendPorts['3443/tcp'][0].HostPort;
      const upstreams = Object.fromEntries(readRouteTable().apiLocations.map(({ app }) => [app, 'backend:3000']));
      const apps = parseAllDocuments(readFileSync(join(root, '.helm/values.yaml'), 'utf8'))[0].toJSON().apps;
      const selectionPath = join(directory, 'selection.json');
      writeFileSync(
        selectionPath,
        JSON.stringify({
          database: { engine: 'postgres' },
          migrations: { enabled: true },
          deployment: { provider: 'postgres', selectedApps: Object.values(apps).map(({ appId }) => appId) },
          selection: {
            ciMode: 'product',
            frontendApiMode: 'same-origin',
            mobileTargets: ['web'],
            deploymentTargets: ['docker'],
            publicTopology: 'single-domain',
            kubernetesDelivery: 'direct',
            infrastructure: { redis: 'bundled', nats: 'bundled', s3: 'bundled' },
          },
          apps: Object.fromEntries(Object.keys(apps).map((key) => [key, { enabled: true }])),
        }),
      );
      const chart = exec('helm', [
        'template',
        'nrb-edge-fixture',
        '.helm',
        '-f',
        '.helm/values-production.yaml',
        '-f',
        selectionPath,
        '--set',
        'frontendNginx.trustedProxyCidrs[0]=' + backendIp + '/32',
      ]);
      const helmConfig = parseAllDocuments(chart)
        .map((document) => document.toJSON())
        .find((document) => document?.kind === 'ConfigMap' && document.metadata.name.endsWith('-frontend-nginx'));
      assert.ok(helmConfig);
      const helmNginx =
        helmConfig.data['default.conf'] ?? Object.values(helmConfig.data).find((value) => value.includes('server {'));
      assert.ok(helmNginx);
      const productionEnv = join(directory, 'native-production.env');
      const serverEnv = join(directory, 'native-server.env');
      writeFileSync(
        productionEnv,
        'PUBLIC_DOMAIN=owned.example\nPRIMARY_APP=user-app\nDATABASE_ENGINE=postgres\nCOMPOSE_DATABASE_MODE=external-db\nCOMPOSE_DOMAIN_MODE=external-proxy\nCOMPOSE_TLS_MODE=external\nEXTERNAL_PROXY_PUBLIC_MODE=single-domain\nFRONTEND_DIST_ROOT=/usr/share/nginx/html\n',
      );
      writeFileSync(serverEnv, 'RUNTIME_MODE=native\nCERTIFICATE_MODE=existing\nCERTIFICATE_NAME=owned.example\n');
      // Test the actual native static/header policy on an owned HTTP listener.
      // Native host certificate provisioning and systemd are separate proof lanes.
      const nativeNginx = renderNginx(loadSingleServerConfiguration({ productionEnv, serverEnv }), 'https')
        .replace(
          /listen (\[::\]:)?(80|443)( ssl)?( default_server)?;/gu,
          (_, ipv6, port, _ssl, defaultServer) =>
            `listen ${ipv6 ?? ''}${port === '443' ? 8080 : 8081}${defaultServer ?? ''};`,
        )
        .replace(/^[ \t]*ssl_[^\n]+\n/gmu, '');
      const variants = [
        ['compose', renderNginxFullstackConfig(readRouteTable(), upstreams), true],
        ['standalone', readFileSync(join(root, 'docker/nginx-spa.conf'), 'utf8'), false],
        // Only service DNS is redirected to the owned Fastify fixture; policy and locations are the actual Helm render.
        ['helm', helmNginx.replace(/proxy_pass http:\/\/[^;]+;/gu, 'proxy_pass http://backend:3000;'), true],
        [
          'native',
          nativeNginx,
          false,
          {
            mountPath: '/usr/share/nginx/html/app',
            healthPath: '/_infra/health',
            headers: { host: 'owned.example' },
            routes: ['/index.html', '/runtime-config.js', '/plain.js', '/logo.svg'],
          },
        ],
      ];
      for (const [variant, config, proxiesApi, options = {}] of variants) {
        writeFileSync(join(directory, 'default.conf'), config);
        docker(
          'run',
          '-d',
          '--name',
          frontend,
          '--network',
          network,
          '--network-alias',
          'frontend',
          '--read-only',
          '--cap-drop',
          'ALL',
          '--security-opt',
          'no-new-privileges:true',
          '--tmpfs',
          '/tmp',
          '-p',
          '127.0.0.1::8080',
          '-v',
          `${html}:${options.mountPath ?? '/usr/share/nginx/html'}:ro`,
          '-v',
          `${join(directory, 'default.conf')}:/etc/nginx/conf.d/default.conf:ro`,
          '-v',
          `${join(directory, 'trusted.conf')}:/etc/nginx/nrb-trusted-proxies.conf:ro`,
          image,
        );
        const ports = JSON.parse(docker('inspect', '--format', '{{json .NetworkSettings.Ports}}', frontend));
        assert.ok(
          ports['8080/tcp']?.[0]?.HostPort,
          `${variant}: owned Nginx published no HTTP port: ${docker('logs', frontend)}`,
        );
        const port = ports['8080/tcp'][0].HostPort;
        const base = `http://127.0.0.1:${port}`;
        await waitFor(`${base}${options.healthPath ?? '/nginx-health'}`, options.headers);
        for (const path of options.routes ?? [
          '/index.html',
          '/profile',
          '/admin/roles',
          '/runtime-config.js',
          '/plain.js',
          '/logo.svg',
        ]) {
          const response = await httpGet(`${base}${path}`, { ...options.headers, accept: 'text/html' });
          assert.equal(response.status, 200, `${variant} ${path}`);
          assertHeaders(response);
          assert.match(response.headers.get('cache-control') ?? '', /no-store/u, `${variant} ${path}`);
        }
        const asset = await httpGet(`${base}/assets/app-Ab12Cd34.js`, options.headers);
        assert.equal(asset.status, 200);
        assertHeaders(asset);
        assert.match(asset.headers.get('cache-control') ?? '', /immutable/u);
        const missing = await httpGet(`${base}/assets/absent-Ab12Cd34.js`, options.headers);
        assert.equal(missing.status, 404);
        assertHeaders(missing);
        assert.ok(!(missing.headers.get('cache-control') ?? '').includes('immutable'));
        if (proxiesApi) {
          const edge = await tlsGet(
            `https://127.0.0.1:${tlsPort}/api/auth/edge-session`,
            readFileSync(join(directory, 'cert.pem')),
          );
          assert.equal(edge.status, 200);
          assert.equal(JSON.parse(edge.body).protocol, 'https');
          const cookies = edge.headers['set-cookie'] ?? [];
          assert.ok(
            cookies.some((value) => value.includes('Secure') && value.includes('HttpOnly')),
            `${variant}: trusted HTTPS must set the secure session cookie`,
          );
          const direct = await fetch(`${base}/api/auth/edge-session`, { headers: { 'x-forwarded-proto': 'https' } });
          assert.equal(direct.status, 200);
          assert.equal((await direct.json()).protocol, 'http');
          assert.equal(direct.headers.get('set-cookie'), null, 'an untrusted claim cannot mint a secure cookie');
          for (const protocol of ['https,http', 'garbage', 'http']) {
            const probe = docker(
              'exec',
              backend,
              'node',
              '-e',
              `fetch('http://frontend:8080/api/auth/edge-session',{headers:{'x-forwarded-proto':${JSON.stringify(protocol)}}}).then(async r=>{require('node:assert/strict').equal((await r.json()).protocol,'http');require('node:assert/strict').equal(r.headers.get('set-cookie'),null);}).catch(()=>process.exit(1));`,
            );
            assert.equal(probe, '');
          }
        }
        docker('rm', '-f', frontend);
      }
    } finally {
      for (const name of [frontend, backend]) {
        try {
          docker('rm', '-f', name);
        } catch {
          /* Remove only our own names. */
        }
      }
      try {
        if (createdNetwork) docker('network', 'rm', network);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  },
);
