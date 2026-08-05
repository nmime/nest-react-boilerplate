#!/usr/bin/env node
/**
 * notify-lane mock transports (plain Node, zero dependencies).
 *
 * One process exposes contract-faithful subsets of every external dependency the
 * notify feature calls over the network:
 *
 *   - 4361  Email send APIs. The codebase's email transports are MailPace
 *           (POST /api/v1/send, `mailpace-server-token` header) and Resend
 *           (POST /emails, bearer token). Both wire contracts are served here.
 *   - 4350  Telegram Bot API subset: getMe, sendMessage, sendPhoto, setWebhook.
 *   - 4351  Discord HTTP API subset used by the bot notification provider:
 *           POST /users/@me/channels (open DM) and POST /channels/:id/messages.
 *   - 4360  Minimal S3 object store (path-style PutObject/GetObject/HeadObject/
 *           DeleteObject/ListObjectsV2) persisting bodies under ./s3-store/.
 *
 * Every request is appended to ./calls.log.jsonl with method, path, query, a
 * redacted body summary, and auth-related header NAMES only (never values).
 */
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, stat, unlink } from 'node:fs/promises';
import { appendFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HARNESS_DIR = dirname(fileURLToPath(import.meta.url));
const CALLS_LOG = join(HARNESS_DIR, 'calls.log.jsonl');
const S3_STORE = join(HARNESS_DIR, 's3-store');

const PORTS = {
  email: 4361,
  telegram: 4350,
  discord: 4351,
  s3: 4360,
};

const AUTHISH_HEADER_PATTERN = /auth|token|key|secret/i;

function summarizeBody(contentType, raw) {
  if (raw.length === 0) {
    return { kind: 'empty', bytes: 0 };
  }
  if (contentType.includes('application/json')) {
    try {
      const parsed = JSON.parse(raw.toString('utf8'));
      const text = JSON.stringify(parsed);
      return { kind: 'json', bytes: raw.length, summary: text.slice(0, 400), truncated: text.length > 400 };
    } catch {
      return { kind: 'invalid-json', bytes: raw.length };
    }
  }
  return { kind: 'binary', bytes: raw.length, sha256: createHash('sha256').update(raw).digest('hex') };
}

async function logCall(service, request, response, body) {
  const url = new URL(request.url, 'http://mock.invalid');
  const authHeaders = Object.keys(request.headers)
    .filter((name) => AUTHISH_HEADER_PATTERN.test(name))
    .sort();
  const entry = {
    ts: new Date().toISOString(),
    service,
    method: request.method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    status: response.statusCode,
    body: summarizeBody(String(request.headers['content-type'] ?? ''), body),
    authHeaders,
  };
  await appendFile(CALLS_LOG, `${JSON.stringify(entry)}\n`, 'utf8');
}

function readBody(request) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => resolveBody(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
  response.end(body);
}

function notFound(response) {
  sendJson(response, 404, { error: 'not_found' });
}

/* ------------------------------------------------------------------ */
/* Email (MailPace + Resend wire contracts)                            */
/* ------------------------------------------------------------------ */

async function handleEmail(request, response) {
  const body = await readBody(request);
  let status = 404;
  let payload = { error: 'not_found' };

  if (request.method === 'POST' && request.url.startsWith('/api/v1/send')) {
    // MailPace send endpoint. The provider only requires a 2xx JSON response.
    status = 200;
    payload = { id: `mailpace-mock-${Date.now()}`, status: 'queued' };
  } else if (request.method === 'POST' && request.url.startsWith('/emails')) {
    // Resend send endpoint. The provider only requires a 2xx JSON response.
    status = 200;
    payload = { id: `resend-mock-${Date.now()}` };
  } else if (request.method === 'GET' && request.url === '/health') {
    status = 200;
    payload = { ok: true };
  }

  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(payload));
  await logCall('email', request, response, body);
}

/* ------------------------------------------------------------------ */
/* Telegram Bot API subset                                             */
/* ------------------------------------------------------------------ */

async function handleTelegram(request, response) {
  const body = await readBody(request);
  const botMatch = /^\/bot[^/]+\/(?<method>[A-Za-z]+)$/u.exec(new URL(request.url, 'http://mock.invalid').pathname);
  let status = 404;
  let payload = { ok: false, description: 'unknown method' };

  if (request.method === 'GET' && request.url === '/health') {
    status = 200;
    payload = { ok: true };
  } else if (request.method === 'POST' && botMatch) {
    switch (botMatch.groups.method) {
      case 'getMe':
        status = 200;
        payload = { ok: true, result: { id: 424242, is_bot: true, first_name: 'Notify Harness Bot', username: 'notify_harness_bot' } };
        break;
      case 'sendMessage':
      case 'sendPhoto':
        status = 200;
        payload = { ok: true, result: { message_id: Date.now() % 1_000_000, date: Math.floor(Date.now() / 1000) } };
        break;
      case 'setWebhook':
        status = 200;
        payload = { ok: true, result: true };
        break;
      default:
        status = 400;
        payload = { ok: false, description: `mock does not implement ${botMatch.groups.method}` };
    }
  }

  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(payload));
  await logCall('telegram', request, response, body);
}

/* ------------------------------------------------------------------ */
/* Discord HTTP API subset (bot notification provider)                 */
/* ------------------------------------------------------------------ */

async function handleDiscord(request, response) {
  const body = await readBody(request);
  const { pathname } = new URL(request.url, 'http://mock.invalid');
  let status = 404;
  let payload = { message: 'not_found' };

  if (request.method === 'GET' && request.url === '/health') {
    status = 200;
    payload = { ok: true };
  } else if (request.method === 'POST' && pathname === '/users/@me/channels') {
    // Open (or reuse) a DM channel for the recipient. The provider needs `id`.
    status = 200;
    const recipient = JSON.parse(body.toString('utf8') || '{}');
    payload = { id: `mock-dm-${createHash('sha1').update(String(recipient.recipient_id ?? '')).digest('hex').slice(0, 16)}` };
  } else if (request.method === 'POST' && /^\/channels\/[^/]+\/messages$/u.test(pathname)) {
    status = 200;
    payload = { id: `mock-message-${Date.now()}`, channel_id: pathname.split('/')[2] };
  }

  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(payload));
  await logCall('discord', request, response, body);
}

/* ------------------------------------------------------------------ */
/* Minimal S3 (path-style)                                             */
/* ------------------------------------------------------------------ */

function s3ObjectPath(pathname) {
  // Path-style layout: /<bucket>/<key...>
  const trimmed = pathname.replace(/^\//u, '');
  const slash = trimmed.indexOf('/');
  if (slash <= 0) {
    return null;
  }
  const bucket = trimmed.slice(0, slash);
  const key = trimmed.slice(slash + 1);
  if (!bucket || !key) {
    return null;
  }
  if (key.includes('..')) {
    return null;
  }
  return { bucket, key, filePath: resolve(S3_STORE, bucket, key) };
}

function s3Error(response, status, code, message) {
  const body = `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>${message}</Message></Error>`;
  response.writeHead(status, { 'content-type': 'application/xml' });
  response.end(body);
}

function metadataHeaders(request) {
  const headers = {};
  for (const [name, value] of Object.entries(request.headers)) {
    if (name.startsWith('x-amz-meta-') && typeof value === 'string') {
      headers[name] = value;
    }
  }
  return headers;
}

async function handleS3(request, response) {
  const body = await readBody(request);
  const url = new URL(request.url, 'http://mock.invalid');
  const parsed = s3ObjectPath(url.pathname);
  const isList = url.searchParams.get('list-type') === '2';

  let status = 404;

  if (request.method === 'GET' && request.url === '/health') {
    status = 200;
    sendJson(response, 200, { ok: true });
    await logCall('s3', request, response, body);
    return;
  }

  if (!parsed) {
    if (request.method === 'GET' && isList) {
      status = 200;
      response.writeHead(200, { 'content-type': 'application/xml' });
      response.end(
        '<?xml version="1.0" encoding="UTF-8"?><ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>mock</Name><KeyCount>0</KeyCount><IsTruncated>false</IsTruncated></ListBucketResult>',
      );
    } else {
      s3Error(response, 404, 'NoSuchKey', 'mock object not found');
    }
    await logCall('s3', request, response, body);
    return;
  }

  const { bucket, key, filePath } = parsed;
  const metaPath = `${filePath}.meta.json`;

  if (request.method === 'PUT') {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, body);
    await writeFile(
      metaPath,
      JSON.stringify({
        contentType: request.headers['content-type'] ?? 'application/octet-stream',
        metadata: metadataHeaders(request),
        updatedAt: new Date().toISOString(),
      }),
    );
    status = 200;
    response.writeHead(200, { etag: `"${createHash('md5').update(body).digest('hex')}"` });
    response.end();
  } else if (request.method === 'GET' || request.method === 'HEAD') {
    try {
      const [objectBody, metaRaw] = await Promise.all([readFile(filePath), readFile(metaPath, 'utf8').catch(() => null)]);
      const meta = metaRaw ? JSON.parse(metaRaw) : { contentType: 'application/octet-stream', metadata: {}, updatedAt: new Date().toISOString() };
      status = 200;
      response.writeHead(200, {
        'content-type': meta.contentType,
        'content-length': objectBody.length,
        'last-modified': new Date(meta.updatedAt).toUTCString(),
        ...meta.metadata,
      });
      response.end(request.method === 'HEAD' ? undefined : objectBody);
    } catch {
      status = 404;
      s3Error(response, 404, 'NoSuchKey', `The specified key does not exist: ${bucket}/${key}`);
    }
  } else if (request.method === 'DELETE') {
    await unlink(filePath).catch(() => undefined);
    await unlink(metaPath).catch(() => undefined);
    status = 204;
    response.writeHead(204);
    response.end();
  } else {
    s3Error(response, 405, 'MethodNotAllowed', `mock does not implement ${request.method}`);
  }

  await logCall('s3', request, response, body);
}

/* ------------------------------------------------------------------ */

function listen(port, handler, name) {
  const dispatch = (request, response) => {
    handler(request, response).catch((error) => {
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'mock_internal_error', message: String(error?.message ?? error) }));
    });
  };
  const server = createServer(dispatch);
  // AWS SDK clients may send `Expect: 100-continue` on object PUTs; answer the
  // interim response so the request body actually arrives.
  server.on('checkContinue', (request, response) => {
    response.writeContinue();
    dispatch(request, response);
  });
  return new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      console.log(JSON.stringify({ event: 'listening', name, port }));
      resolveListen(server);
    });
  });
}

const servers = await Promise.all([
  listen(PORTS.email, handleEmail, 'email'),
  listen(PORTS.telegram, handleTelegram, 'telegram'),
  listen(PORTS.discord, handleDiscord, 'discord'),
  listen(PORTS.s3, handleS3, 's3'),
]);

await mkdir(S3_STORE, { recursive: true });
console.log(JSON.stringify({ event: 'ready', callsLog: CALLS_LOG, s3Store: S3_STORE }));

function shutdown() {
  for (const server of servers) {
    server.close();
  }
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
