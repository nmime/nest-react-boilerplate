import { betterAuth } from 'better-auth';
import { memoryAdapter, type MemoryDB } from 'better-auth/adapters/memory';
import { sign } from '@tma.js/init-data-node';
import { describe, expect, it } from 'vitest';
import { telegramPlugin } from './telegram';

const botToken = '123456789:test-bot-token';

const signedInitData = (id = 777): string =>
  sign(
    {
      query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
      start_param: 'profile',
      user: {
        allows_write_to_pm: true,
        first_name: 'Ada',
        id,
        language_code: 'en',
        last_name: 'Lovelace',
        photo_url: 'https://cdn.example.test/ada.png',
        username: 'ada',
      },
    },
    botToken,
    new Date(),
  );

const createTestAuth = (database: MemoryDB) =>
  betterAuth({
    baseURL: 'http://localhost:3000',
    database: memoryAdapter(database),
    secret: 'test-secret-that-is-longer-than-thirty-two-characters',
    plugins: [telegramPlugin({ botToken, maxAgeSeconds: 300 })],
  });

describe('telegramPlugin TMA session', () => {
  it('validates signed initData, persists one Telegram account, and issues a Better Auth session cookie', async () => {
    const database: MemoryDB = { account: [], session: [], user: [], verification: [] };
    const auth = createTestAuth(database);
    const request = () =>
      new Request('http://localhost:3000/api/auth/telegram/tma', {
        body: JSON.stringify({ initData: signedInitData() }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });

    const first = await auth.handler(request());
    expect(first.status).toBe(200);
    const body = (await first.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      identity: {
        channel: 'telegram_tma',
        provider: 'telegram',
        providerSubject: '777',
      },
      status: 'authenticated',
    });
    const cookie = first.headers.get('set-cookie');
    expect(cookie).toContain('better-auth.session_token=');

    const headers = new Headers({ cookie: cookie?.split(';', 1)[0] ?? '' });
    await expect(auth.api.getSession({ headers })).resolves.toMatchObject({
      user: { email: 'telegram-777@telegram.invalid', name: 'Ada Lovelace' },
    });
    await expect(auth.api.listUserAccounts({ headers })).resolves.toEqual([
      expect.objectContaining({ accountId: '777', providerId: 'telegram' }),
    ]);

    const second = await auth.handler(request());
    expect(second.status).toBe(200);
    expect(database.account).toHaveLength(1);
    expect(database.user).toHaveLength(1);
    expect(database.session).toHaveLength(2);
  });

  it('rejects tampered and expired Telegram initData without creating an account', async () => {
    const database: MemoryDB = { account: [], session: [], user: [], verification: [] };
    const auth = createTestAuth(database);
    const tampered = signedInitData().replace('Ada', 'Mallory');
    const expired = sign({ user: { first_name: 'Ada', id: 777 } }, botToken, new Date(Date.now() - 301_000));

    for (const initData of [tampered, expired]) {
      // eslint-disable-next-line no-await-in-loop -- each rejection is asserted independently
      const response = await auth.handler(
        new Request('http://localhost:3000/api/auth/telegram/tma', {
          body: JSON.stringify({ initData }),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        }),
      );
      expect(response.status).toBe(401);
    }
    expect(database.account ?? []).toHaveLength(0);
    expect(database.user ?? []).toHaveLength(0);
  });
});
