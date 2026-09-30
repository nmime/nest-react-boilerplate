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
 *           DeleteObject/ListObjectsV2) persisting bodies in private temporary state.
 *
 * Request logs record method, safe path/query, body size/hash, and auth-related
 * header NAMES only. No raw message bodies or credential values are recorded.
 */
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { appendFile, lstat, mkdir, mkdtemp, open, realpath, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_PORTS = {
  email: 4361,
  telegram: 4350,
  discord: 4351,
  s3: 4360,
};

const AUTHISH_HEADER_PATTERN = /auth|token|key|secret/i;
const MAX_BODY_BYTES = 8 * 1024 * 1024;

class FixtureRequestError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

async function privateDirectory(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid() || (info.mode & 0o077) !== 0) {
    throw new Error('Notification fixture state must be a private current-user-owned directory.');
  }
  return realpath(directory);
}

export async function startMockTransports({
  directory,
  ports = DEFAULT_PORTS,
  onEvent = (event) => console.log(JSON.stringify(event)),
} = {}) {
  const stateDirectory = await privateDirectory(directory ?? (await mkdtemp(join(tmpdir(), 'nrb-notify-'))));
  const CALLS_LOG = join(stateDirectory, 'calls.log.jsonl');
  const S3_STORE = await privateDirectory(join(stateDirectory, 's3-store'));
  const log = await open(
    CALLS_LOG,
    constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW,
    0o600,
  );
  await log.close();

  function summarizeBody(contentType, raw) {
    if (raw.length === 0) {
      return { kind: 'empty', bytes: 0 };
    }
    return {
      kind: contentType.includes('application/json') ? 'json' : 'binary',
      bytes: raw.length,
      sha256: createHash('sha256').update(raw).digest('hex'),
    };
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
      path: service === 'telegram' ? url.pathname.replace(/^\/bot[^/]+\//u, '/bot[redacted]/') : url.pathname,
      query: Object.fromEntries(
        [...url.searchParams].map(([key, value]) => [
          key,
          ['list-type', 'max-keys'].includes(key) ? value : '[redacted]',
        ]),
      ),
      status: response.statusCode,
      body: summarizeBody(String(request.headers['content-type'] ?? ''), body),
      authHeaders,
    };
    await appendFile(CALLS_LOG, `${JSON.stringify(entry)}\n`, 'utf8');
  }

  function readBody(request) {
    return new Promise((resolveBody, reject) => {
      const chunks = [];
      let bytes = 0;
      let oversized = false;
      request.on('data', (chunk) => {
        bytes += chunk.length;
        if (oversized) return;
        if (bytes > MAX_BODY_BYTES) {
          oversized = true;
          chunks.length = 0;
          reject(new FixtureRequestError(413, 'payload_too_large'));
          return;
        }
        chunks.push(chunk);
      });
      request.on('end', () => {
        if (!oversized) resolveBody(Buffer.concat(chunks));
      });
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
          payload = {
            ok: true,
            result: { id: 424242, is_bot: true, first_name: 'Notify Harness Bot', username: 'notify_harness_bot' },
          };
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
      payload = {
        id: `mock-dm-${createHash('sha1')
          .update(String(recipient.recipient_id ?? ''))
          .digest('hex')
          .slice(0, 16)}`,
      };
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

  function s3ObjectPath(pathname, isList) {
    let decoded;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      throw new FixtureRequestError(400, 'invalid_object_key');
    }
    if (!decoded.startsWith('/') || /[\\\u0000-\u001f\u007f]/u.test(decoded)) {
      throw new FixtureRequestError(400, 'invalid_object_key');
    }
    const [bucket, ...segments] = decoded.slice(1).split('/');
    if (isList && segments.length === 1 && segments[0] === '') segments.pop();
    if (
      !/^[a-z0-9][a-z0-9.-]*$/u.test(bucket ?? '') ||
      [bucket, ...segments].some((part) => part === '' || part === '.' || part === '..')
    ) {
      throw new FixtureRequestError(400, 'invalid_object_key');
    }
    if (segments.length === 0) return null;
    const filePath = resolve(S3_STORE, bucket, ...segments);
    const owned = relative(S3_STORE, filePath);
    if (isAbsolute(owned) || owned === '..' || owned.startsWith(`..${sep}`)) {
      throw new FixtureRequestError(400, 'invalid_object_key');
    }
    return { bucket, key: segments.join('/'), filePath };
  }

  async function checkObjectComponents(filePath, createParents) {
    const parts = relative(S3_STORE, filePath).split(sep);
    let current = S3_STORE;
    for (const [index, part] of parts.entries()) {
      current = join(current, part);
      const parent = index < parts.length - 1;
      if (parent && createParents)
        await mkdir(current, { mode: 0o700 }).catch((error) => {
          if (error.code !== 'EEXIST') throw error;
        });
      const info = await lstat(current).catch((error) => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
      if (info && (info.isSymbolicLink() || (parent ? !info.isDirectory() : !info.isFile()))) {
        throw new FixtureRequestError(400, 'invalid_object_key');
      }
    }
  }

  async function objectFile(filePath, write, body) {
    const file = await open(
      filePath,
      write
        ? constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW
        : constants.O_RDONLY | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      return write ? await file.writeFile(body) : await file.readFile();
    } finally {
      await file.close();
    }
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
    const isList = url.searchParams.get('list-type') === '2';

    let status = 404;

    if (request.method === 'GET' && request.url === '/health') {
      status = 200;
      sendJson(response, 200, { ok: true });
      await logCall('s3', request, response, body);
      return;
    }

    // Parse the raw request target: URL would normalize dot segments before validation.
    const parsed = s3ObjectPath(request.url.split('?')[0], isList);

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

    const { filePath } = parsed;
    const metaPath = `${filePath}.meta.json`;
    await checkObjectComponents(filePath, request.method === 'PUT');
    await checkObjectComponents(metaPath, false);

    if (request.method === 'PUT') {
      await objectFile(filePath, true, body);
      await objectFile(
        metaPath,
        true,
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
        const [objectBody, metaRaw] = await Promise.all([
          objectFile(filePath, false),
          objectFile(metaPath, false)
            .then((raw) => raw.toString('utf8'))
            .catch((error) => {
              if (error.code === 'ENOENT') return null;
              throw error;
            }),
        ]);
        const meta = metaRaw
          ? JSON.parse(metaRaw)
          : { contentType: 'application/octet-stream', metadata: {}, updatedAt: new Date().toISOString() };
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
        s3Error(response, 404, 'NoSuchKey', 'The specified key does not exist.');
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
        if (response.headersSent) {
          response.destroy();
          return;
        }
        sendJson(response, error instanceof FixtureRequestError ? error.status : 500, {
          error: error instanceof FixtureRequestError ? error.code : 'mock_internal_error',
        });
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
        onEvent({ event: 'listening', name, port: server.address().port });
        resolveListen(server);
      });
    });
  }

  const servers = [];
  const boundPorts = {};
  async function close() {
    await Promise.all(
      servers.map(
        (server) =>
          new Promise((done) => {
            server.close(done);
            server.closeIdleConnections();
          }),
      ),
    );
  }
  try {
    for (const [name, handler] of Object.entries({
      email: handleEmail,
      telegram: handleTelegram,
      discord: handleDiscord,
      s3: handleS3,
    })) {
      const server = await listen(ports[name] ?? DEFAULT_PORTS[name], handler, name);
      servers.push(server);
      boundPorts[name] = server.address().port;
    }
  } catch (error) {
    await close();
    throw error;
  }
  onEvent({ event: 'ready', callsLog: CALLS_LOG, s3Store: S3_STORE });
  return { directory: stateDirectory, callsLog: CALLS_LOG, s3Store: S3_STORE, ports: boundPorts, close };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const fixture = await startMockTransports({ directory: process.env.NRB_NOTIFY_HARNESS_DIR });
  const shutdown = () => {
    fixture.close().then(() => process.exit(0));
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
