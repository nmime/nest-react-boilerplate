#!/usr/bin/env node
/**
 * notify-lane end-to-end check.
 *
 * Boots ./mock-transports.mjs, then exercises the REAL wiring of the live apps:
 *
 *   auth-app-api  (3003) — register/login, session cookie for the admin API
 *   admin-app-api (3001) — notification template/segment/upload/broadcast admin API
 *   notification-consumer — claims CSV segment uploads (S3 GetObject), snapshots,
 *                           and materializes broadcasts into deliveries
 *   notification-scheduler — claims pending deliveries and dispatches them through
 *                           the Telegram/Discord/email providers to the mocks
 *
 * Evidence: transport calls appended to ./calls.log.jsonl by the mocks, S3 objects
 * persisted under ./s3-store/, and delivery state transitions observed via the
 * admin API. Prints one JSON line and exits 0 (pass) or 1 (fail).
 */
import { spawn, execSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, truncate, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HARNESS_DIR = dirname(fileURLToPath(import.meta.url));
const CALLS_LOG = join(HARNESS_DIR, 'calls.log.jsonl');
const S3_STORE = join(HARNESS_DIR, 's3-store');

const AUTH_API = 'http://127.0.0.1:3003';
const ADMIN_API = 'http://127.0.0.1:3001';
const MOCK_PORTS = { email: 4361, telegram: 4350, discord: 4351, s3: 4360 };
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5432/social_agents';

const ADMIN_EMAIL = 'notify-admin@harness.test';
const ADMIN_PASSWORD = 'Harness123!Notify';
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const RUN = new Date()
  .toISOString()
  .replace(/[^0-9]/gu, '')
  .slice(0, 14);

const evidence = [];
let failed = false;

function note(message) {
  evidence.push(message);
}

function fail(message) {
  failed = true;
  evidence.push(`FAIL: ${message}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ------------------------------------------------------------------ */
/* infrastructure helpers                                              */
/* ------------------------------------------------------------------ */

async function waitForPort(port, timeoutMs, isTls = false) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const probe = await fetch(`http${isTls ? 's' : ''}://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(1500),
      }).catch(() => null);
      if (probe) {
        return true;
      }
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  return false;
}

function processAlive(pattern) {
  try {
    const output = execSync(`pgrep -fa "${pattern}" | grep -v pgrep | grep -v check.mjs || true`, {
      encoding: 'utf8',
    });
    return output.trim().length > 0;
  } catch {
    return false;
  }
}

function psql(query) {
  const flat = query.replace(/\s+/gu, ' ').trim();
  return execSync(`psql "${DATABASE_URL}" -t -A -c ${JSON.stringify(flat)}`, { encoding: 'utf8' }).trim();
}

async function readCalls() {
  try {
    const content = await readFile(CALLS_LOG, 'utf8');
    return content
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* HTTP helpers                                                        */
/* ------------------------------------------------------------------ */

let sessionCookie;

async function http(method, url, { body, headers = {}, cookie = true } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(cookie && sessionCookie ? { cookie: sessionCookie } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  const setCookies = response.headers.getSetCookie?.() ?? [];
  const session = setCookies.map((item) => item.split(';')[0]).find((item) => item.startsWith('nrb.sid='));
  if (session) {
    sessionCookie = session;
  }
  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  return { status: response.status, json };
}

async function adminRequest(method, path, { body, headers = {} } = {}) {
  const response = await http(method, `${ADMIN_API}${path}`, { body, headers });
  if (response.status >= 400) {
    throw new Error(`${method} ${path} -> ${response.status} ${JSON.stringify(response.json).slice(0, 300)}`);
  }
  return response.json?.data ?? null;
}

/* ------------------------------------------------------------------ */
/* steps                                                               */
/* ------------------------------------------------------------------ */

async function startMocks() {
  await mkdir(S3_STORE, { recursive: true });
  await writeFile(CALLS_LOG, '');
  const child = spawn(process.execPath, [join(HARNESS_DIR, 'mock-transports.mjs')], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let ready = false;
  child.stdout.on('data', (chunk) => {
    if (String(chunk).includes('"event":"ready"')) {
      ready = true;
    }
  });
  child.stderr.on('data', (chunk) => process.stderr.write(`[mocks] ${chunk}`));
  const deadline = Date.now() + 15_000;
  while (!ready && Date.now() < deadline) {
    await sleep(200);
  }
  for (const [name, port] of Object.entries(MOCK_PORTS)) {
    if (!(await waitForPort(port, 10_000))) {
      throw new Error(`mock ${name} did not start on port ${port}`);
    }
  }
  note('mocks: mock-transports.mjs listening on email=4361 telegram=4350 discord=4351 s3=4360');
  return child;
}

async function verifyLiveApps() {
  for (const [name, base] of [
    ['auth-app-api', AUTH_API],
    ['admin-app-api', ADMIN_API],
  ]) {
    const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
    if (!response || response.status !== 200) {
      throw new Error(`${name} health check failed (${base}/health)`);
    }
    note(`live: ${name} healthy at ${base}/health`);
  }
  if (!processAlive('notification-scheduler')) {
    throw new Error('notification-scheduler process is not running');
  }
  note('live: notification-scheduler process running');
  if (!processAlive('notification-consumer')) {
    throw new Error('notification-consumer process is not running');
  }
  note('live: notification-consumer process running');
}

async function establishAdminSession() {
  const register = await http('POST', `${AUTH_API}/auth/register`, {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, displayName: 'Notify Lane Admin' },
    cookie: false,
  });
  if (register.status === 200) {
    note(`auth: registered ${ADMIN_EMAIL} via POST /auth/register (session cookie established)`);
  } else {
    const login = await http('POST', `${AUTH_API}/auth/login`, {
      body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      cookie: false,
    });
    if (login.status !== 200) {
      throw new Error(`auth register/login failed: ${login.status} ${JSON.stringify(login.json).slice(0, 200)}`);
    }
    note(`auth: logged in ${ADMIN_EMAIL} via POST /auth/login (session cookie established)`);
  }

  // Harness fixture data: make sure the account carries the admin role in the
  // normalized RBAC tables so login resolves admin permissions (registration
  // itself only grants it under ADMIN_BOOTSTRAP_ENABLED, which stays false).
  const userId = psql(`select id from auth_users where email = '${ADMIN_EMAIL}' and tenant_id = '${TENANT_ID}'`);
  if (!userId) {
    throw new Error('registered user not found in auth_users');
  }
  const adminRoleId = psql(`select id from auth_roles where key = 'admin'`);
  psql(
    `insert into auth_user_roles (auth_user_id, role_id) values ('${userId}', '${adminRoleId}') on conflict do nothing`,
  );
  note(`fixture: granted admin role to ${ADMIN_EMAIL} via auth_user_roles (harness-side data)`);

  const login = await http('POST', `${AUTH_API}/auth/login`, {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    cookie: false,
  });
  const roles = login.json?.data?.user?.roles ?? [];
  const permissions = login.json?.data?.user?.permissions ?? [];
  if (!roles.includes('admin') || !permissions.includes('admin:notification-templates:write')) {
    throw new Error(`login did not resolve admin permissions (roles=${roles.join(',')})`);
  }
  note(`auth: session principal has roles=[${roles.join(',')}] incl. admin notification permissions`);
  return userId;
}

async function createPublishedTemplate() {
  const code = `notify-lane-${RUN}`;
  const created = await adminRequest('POST', '/admin/notification-templates', {
    body: {
      code,
      name: 'Notify lane template',
      variablesSchema: { name: { type: 'string', required: true } },
      channels: [
        {
          channel: 'email',
          engine: 'string-format',
          content: { subject: { en: 'Notify lane: {name}' }, body: { en: 'Hello {name}, notify lane proof.' } },
        },
        { channel: 'bot', engine: 'string-format', content: { body: { en: 'Hello {name}, notify lane proof.' } } },
      ],
    },
  });
  const templateId = created.id;
  const published = await adminRequest('POST', `/admin/notification-templates/${templateId}/publish`);
  const versionId = published.currentVersionId ?? published.versions?.find((version) => version.publishedAt)?.id;
  if (!versionId) {
    throw new Error(`publish did not yield a published version: ${JSON.stringify(published).slice(0, 300)}`);
  }
  note(`admin: created+published template ${code} (id=${templateId}, version=${versionId})`);
  return versionId;
}

async function createStaticSegmentWithCsv(name, csv) {
  const segment = await adminRequest('POST', '/admin/notification-segments', {
    body: { name, kind: 'static' },
  });
  const upload = await adminRequest('POST', `/admin/notification-segments/${segment.id}/uploads`, {
    body: { filename: `${name}.csv`, contentBase64: Buffer.from(csv, 'utf8').toString('base64') },
  });
  // The consumer claims the upload (S3 GetObject) and parses the CSV.
  let uploadState = upload;
  const deadline = Date.now() + 60_000;
  while (uploadState.status !== 'completed' && uploadState.status !== 'failed' && Date.now() < deadline) {
    await sleep(1000);
    uploadState = await adminRequest('GET', `/admin/notification-segment-uploads/${upload.id}`);
  }
  if (uploadState.status !== 'completed') {
    throw new Error(
      `segment upload ${upload.id} ended ${uploadState.status}: ${JSON.stringify(uploadState).slice(0, 300)}`,
    );
  }
  note(`admin: static segment ${name} (id=${segment.id}) CSV upload ${upload.id} completed via consumer`);
  return segment.id;
}

async function runBroadcast(name, versionId, segmentId, channel, provider) {
  const broadcast = await adminRequest('POST', '/admin/notification-broadcasts', {
    body: { name, templateVersionId: versionId, channel, provider, segmentIds: [segmentId] },
  });
  await adminRequest('POST', `/admin/notification-broadcasts/${broadcast.id}/collect-audience`, {
    headers: { 'idempotency-key': randomUUID() },
  });
  let state = await adminRequest('GET', `/admin/notification-broadcasts/${broadcast.id}`);
  let deadline = Date.now() + 90_000;
  while (state.status !== 'ready' && state.status !== 'failed' && Date.now() < deadline) {
    await sleep(1000);
    state = await adminRequest('GET', `/admin/notification-broadcasts/${broadcast.id}`);
  }
  if (state.status !== 'ready') {
    throw new Error(`broadcast ${broadcast.id} did not reach ready (status=${state.status})`);
  }
  note(`admin: broadcast ${name} (id=${broadcast.id}) audience collected (snapshotCount=${state.snapshotCount})`);

  await adminRequest('POST', `/admin/notification-broadcasts/${broadcast.id}/send`, {
    headers: { 'idempotency-key': randomUUID() },
  });
  note(`admin: broadcast ${name} transitioned to sending via POST .../send`);
  return broadcast.id;
}

async function waitForTransportEvidence(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const wanted = {
    emailSend: (call) =>
      call.service === 'email' && call.method === 'POST' && call.path === '/api/v1/send' && call.status === 200,
    telegramSendMessage: (call) =>
      call.service === 'telegram' && /\/sendMessage$/u.test(call.path) && call.status === 200,
    discordOpenDm: (call) => call.service === 'discord' && call.path === '/users/@me/channels' && call.status === 200,
    discordMessage: (call) => call.service === 'discord' && /\/messages$/u.test(call.path) && call.status === 200,
    s3Put: (call) => call.service === 's3' && call.method === 'PUT' && call.status === 200 && call.path !== '/health',
    s3Get: (call) =>
      call.service === 's3' &&
      call.method === 'GET' &&
      call.status === 200 &&
      call.path !== '/health' &&
      !call.query['list-type'],
  };
  const found = {};
  while (Date.now() < deadline) {
    const calls = await readCalls();
    for (const [name, predicate] of Object.entries(wanted)) {
      if (!found[name]) {
        const match = calls.find(predicate);
        if (match) {
          found[name] = match;
        }
      }
    }
    if (Object.keys(found).length === Object.keys(wanted).length) {
      break;
    }
    await sleep(2000);
  }
  return found;
}

/* ------------------------------------------------------------------ */

async function main() {
  const mocks = await startMocks();
  try {
    await verifyLiveApps();
    const userId = await establishAdminSession();
    const versionId = await createPublishedTemplate();

    const recipientEmail = `notify-recipient-${RUN}@harness.test`;
    const telegramChatId = '987654321';

    // Seed the Discord external identity for the harness user so the
    // user-targeted Discord delivery resolves to a provider subject.
    psql(
      `insert into auth_external_identities (id, tenant_id, auth_user_id, provider, provider_subject, channel, display_name)
       values (gen_random_uuid(), '${TENANT_ID}', '${userId}', 'discord', '111222333444555666', 'discord_oauth', 'Notify Lane User')
       on conflict (tenant_id, provider, provider_subject) do nothing`,
    );
    note('fixture: seeded auth_external_identities (discord) for the harness user');

    const emailSegment = await createStaticSegmentWithCsv(
      `notify-email-${RUN}`,
      `target_type,target_id,name\nemail,${recipientEmail},Email Recipient\n`,
    );
    const telegramSegment = await createStaticSegmentWithCsv(
      `notify-telegram-${RUN}`,
      `target_type,target_id,name\ntelegram-chat,${telegramChatId},Telegram Chat\n`,
    );
    const discordSegment = await createStaticSegmentWithCsv(
      `notify-discord-${RUN}`,
      `target_type,target_id,name\nuser,${userId},Discord User\n`,
    );

    await runBroadcast(`notify-email-${RUN}`, versionId, emailSegment, 'email', 'mailpace');
    await runBroadcast(`notify-telegram-${RUN}`, versionId, telegramSegment, 'bot', 'telegram-bot');
    await runBroadcast(`notify-discord-${RUN}`, versionId, discordSegment, 'bot', 'discord-bot');

    const found = await waitForTransportEvidence(150_000);

    if (found.emailSend) {
      note(
        `evidence: MailPace email mock hit POST /api/v1/send -> 200 at ${found.emailSend.ts} (authHeaders=[${found.emailSend.authHeaders}])`,
      );
    } else {
      fail('no MailPace/Resend email send call reached the mock');
    }
    if (found.telegramSendMessage) {
      note(
        `evidence: Telegram mock hit ${found.telegramSendMessage.path} -> 200 at ${found.telegramSendMessage.ts} (chat target ${telegramChatId})`,
      );
    } else {
      fail('no Telegram sendMessage call reached the mock');
    }
    if (found.discordOpenDm && found.discordMessage) {
      note(
        `evidence: Discord mock hit POST /users/@me/channels and ${found.discordMessage.path} -> 200 at ${found.discordMessage.ts}`,
      );
    } else {
      fail('no Discord DM/message calls reached the mock');
    }
    if (found.s3Put && found.s3Get) {
      note(`evidence: S3 mock received PUT ${found.s3Put.path} -> 200 and GET ${found.s3Get.path} -> 200`);
    } else {
      fail('no S3 PutObject/GetObject calls reached the mock');
    }

    const storedObjects = execSync(`find ${S3_STORE} -type f -name '*.csv' | sort`, { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
    if (storedObjects.length >= 3) {
      note(
        `evidence: ${storedObjects.length} segment CSV objects persisted under s3-store/ (${storedObjects[0].replace(HARNESS_DIR, '')}, ...)`,
      );
    } else {
      fail(`expected >=3 S3 objects under s3-store/, found ${storedObjects.length}`);
    }

    const calls = await readCalls();
    note(`evidence: ${calls.length} transport calls recorded in calls.log.jsonl`);
  } finally {
    mocks.kill('SIGTERM');
  }

  const result = { lane: 'notify', passed: !failed, evidence };
  console.log(JSON.stringify(result));
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  const result = { lane: 'notify', passed: false, evidence: [...evidence, `FAIL: ${error?.stack ?? error}`] };
  console.log(JSON.stringify(result));
  process.exit(1);
});
