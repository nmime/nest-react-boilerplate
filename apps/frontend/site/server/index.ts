import fastifyStatic from '@fastify/static';
import fastify from 'fastify';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderPage } from 'vike/server';

const appRoot = resolve(import.meta.dirname, '..');
const workspaceDistRoot = resolve(appRoot, '../../../dist/apps/frontend/site');
const defaultSiteRoot = existsSync(join(appRoot, 'client')) ? appRoot : workspaceDistRoot;
const siteRoot = resolve(process.env.SITE_DIST_ROOT ?? defaultSiteRoot);
const clientAssetsRoot = join(siteRoot, 'client');
const serverEntryPath = join(siteRoot, 'server/entry.mjs');

function readPort(name: string, value: string | undefined): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(parsed) || String(parsed) !== trimmed || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  if (parsed > 65_535) {
    throw new Error(`${name} must be between 1 and 65535.`);
  }

  return parsed;
}

const configuredPort = readPort('SITE_APP_PORT', process.env.SITE_APP_PORT) ?? readPort('PORT', process.env.PORT);
if (configuredPort === undefined) {
  throw new Error('No explicit site port configured. Set SITE_APP_PORT or PORT.');
}
const port = configuredPort;

// Containers need every interface, because the port is published from outside. A
// host-native process behind a reverse proxy must not be publicly reachable, so it
// sets HOST explicitly instead of inheriting the container default.
const host = process.env.SITE_APP_HOST?.trim() || process.env.HOST?.trim() || '0.0.0.0';

if (process.env.NODE_ENV === 'production') {
  if (!existsSync(serverEntryPath)) {
    throw new Error(`Missing Vike production server entry: ${serverEntryPath}`);
  }

  await import(pathToFileURL(serverEntryPath).href);
}

const app = fastify({
  logger: process.env.NODE_ENV !== 'test',
});

if (existsSync(clientAssetsRoot)) {
  await app.register(fastifyStatic, {
    root: clientAssetsRoot,
    wildcard: false,
  });
}

const runtime = typeof Reflect.get(process.versions, 'bun') === 'string' ? 'bun' : 'node';
const healthPayload = { status: 'ok', service: 'site-app', runtime } as const;

app.get('/health', () => healthPayload);
app.get('/live', () => healthPayload);
app.get('/ready', () => healthPayload);

app.get('/*', async (request, reply) => {
  const pageContext = await renderPage({
    headersOriginal: request.headers,
    urlOriginal: request.raw.url ?? '/',
  });
  // Vike types `httpResponse` as always present, but it is `null` for requests
  // Vike does not render (e.g. asset paths without a matching route), so keep
  // the fallback guard and reflect the real nullability here.
  const httpResponse = pageContext.httpResponse as typeof pageContext.httpResponse | null;

  if (!httpResponse) {
    return reply.code(404).send('Not found');
  }

  httpResponse.headers.forEach(([name, value]) => {
    reply.header(name, value);
  });

  return reply.code(httpResponse.statusCode).send(httpResponse.body);
});

await app.listen({ host, port });
