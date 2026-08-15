#!/usr/bin/env node
/**
 * Renders docker/nginx-fullstack.conf from .helm/frontend-routes.json — the same table the Helm
 * chart reads through .Files.Get. Adding an API namespace used to mean editing the chart template
 * and this conf in lockstep, which is how the Kubernetes and Compose edges silently diverged.
 *
 * Run with --check in CI (scripts/validate-deployment-config.mjs does) to fail on a stale conf.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicApps } from './delivery-inventory.mjs';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const routeTablePath = join(rootDir, '.helm/frontend-routes.json');
const generatedPath = join(rootDir, 'docker/nginx-fullstack.conf');

const composeUpstreams = Object.fromEntries(publicApps.map(([appId, , upstream]) => [appId, upstream]));

export function readRouteTable(path = routeTablePath) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

const securityHeaders = [
  'add_header X-Content-Type-Options "nosniff" always;',
  'add_header X-Frame-Options "SAMEORIGIN" always;',
  'add_header Referrer-Policy "strict-origin-when-cross-origin" always;',
];
const contentSecurityPolicy =
  "add_header Content-Security-Policy \"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'\" always;";
const noStoreHeaders = [
  'add_header Cache-Control "private, no-cache, no-store, must-revalidate" always;',
  'add_header Expires "Sat, 01 Jan 2000 00:00:00 GMT" always;',
  'add_header Pragma "no-cache" always;',
];
const proxyHeaders = [
  'proxy_http_version 1.1;',
  'proxy_set_header Host $host;',
  'proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;',
  'proxy_set_header X-Forwarded-Proto $scheme;',
];

/** Wrap a route note at the conf's comment width so the generated file stays readable. */
function commentLines(note, indent) {
  const words = note.split(/\s+/u);
  const lines = [];
  let current = '';
  for (const word of words) {
    if (current && `${current} ${word}`.length > 66) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines.map((line) => `${indent}# ${line}`);
}

export function renderNginxFullstackConfig(routes, upstreams = composeUpstreams) {
  const lines = [
    'map $http_accept $frontend_accepts_html {',
    '  default 0;',
    '  "~*text/html" 1;',
    '}',
    '',
    'map $request_method $frontend_is_navigation_method {',
    '  default 0;',
    '  GET 1;',
    '  HEAD 1;',
    '}',
    '',
    'map "$frontend_is_navigation_method:$frontend_accepts_html" $frontend_spa_navigation {',
    '  default 0;',
    '  "1:1" 1;',
    '}',
    '',
    'server {',
    '  listen 8080;',
    '  server_name _;',
    '',
    '  root /usr/share/nginx/html;',
    '  index index.html;',
    '',
    ...securityHeaders.map((header) => `  ${header}`),
    '  # SPA navigation and API requests can intentionally share paths such as',
    '  # /admin/roles. Keep their cache entries separate by negotiated media type.',
    '  add_header Vary "Accept" always;',
    `  ${contentSecurityPolicy}`,
    '',
    '  location = /nginx-health {',
    '    access_log off;',
    '    add_header Content-Type text/plain;',
    '    return 200 "ok\\n";',
    '  }',
    '',
    '  location = /.env {',
    '    return 404;',
    '  }',
    '',
    '  location ^~ /.git/ {',
    '    return 404;',
    '  }',
    '',
    '  location = /server-status {',
    '    return 404;',
    '  }',
    '',
    '  location = /actuator/env {',
    '    return 404;',
    '  }',
    '',
    '  location = /index.html {',
    ...securityHeaders.map((header) => `    ${header}`),
    '    add_header Vary "Accept" always;',
    `    ${contentSecurityPolicy}`,
    ...noStoreHeaders.map((header) => `    ${header}`),
    '    try_files $uri =404;',
    '  }',
    '',
  ];

  for (const route of routes.spaRoutes) {
    if (route.note) lines.push(...commentLines(route.note, '  '));
    lines.push(`  location = ${route.path} {`, '    try_files /index.html =404;', '  }', '');
  }

  lines.push(
    '  error_page 418 = @frontend_spa;',
    '',
    '  location @frontend_spa {',
    '    try_files /index.html =404;',
    '  }',
    '',
  );

  for (const location of routes.apiLocations) {
    const upstream = upstreams[location.app];
    if (!upstream) throw new Error(`Route ${location.prefix} targets unknown app "${location.app}".`);
    if (location.note) lines.push(...commentLines(location.note, '  '));
    lines.push(`  location ^~ ${location.prefix} {`);
    if (location.spaFallback) {
      lines.push('    if ($frontend_spa_navigation) {', '      return 418;', '    }', '');
    }
    lines.push(...proxyHeaders.map((header) => `    ${header}`), `    proxy_pass http://${upstream};`, '  }', '');
  }

  lines.push(
    '  # Per-deployment runtime config. Must never be cached: it is rewritten at',
    '  # container start, and the hashed-asset rule below would otherwise pin it as',
    '  # immutable for a year. An exact-match location outranks that regex.',
    '  location = /runtime-config.js {',
    '    try_files $uri =404;',
    '    add_header X-Content-Type-Options "nosniff" always;',
    ...noStoreHeaders.map((header) => `    ${header}`),
    '  }',
    '',
    '  location / {',
    '    try_files $uri $uri/ /index.html;',
    '  }',
    '',
    '  location ~* \\.(css|js|jpg|jpeg|gif|png|svg|ico|ttf|woff|woff2|eot)$ {',
    '    try_files $uri =404;',
    '    add_header X-Content-Type-Options "nosniff" always;',
    '    add_header Referrer-Policy "strict-origin-when-cross-origin" always;',
    '    add_header Cache-Control "public, max-age=31536000, immutable" always;',
    '  }',
    '}',
    '',
  );

  return `${['# Generated by scripts/generate-nginx-config.mjs from .helm/frontend-routes.json. Do not edit.', ...lines].join('\n')}`;
}

function main() {
  const rendered = renderNginxFullstackConfig(readRouteTable());
  if (process.argv.includes('--check')) {
    if (!existsSync(generatedPath) || readFileSync(generatedPath, 'utf8') !== rendered) {
      process.stderr.write('docker/nginx-fullstack.conf is stale; run node scripts/generate-nginx-config.mjs.\n');
      process.exitCode = 1;
      return;
    }
    process.stdout.write('docker/nginx-fullstack.conf is current.\n');
    return;
  }
  writeFileSync(generatedPath, rendered);
  process.stdout.write('Generated docker/nginx-fullstack.conf.\n');
}

if (process.argv[1] && join(process.argv[1]) === fileURLToPath(import.meta.url)) main();
