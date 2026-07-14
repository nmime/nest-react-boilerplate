import { describe, expect, it } from 'vitest';
import { resolveTelegramIdentity } from './identity';

describe('Telegram bot identity', () => {
  it('returns null when an update has no Telegram sender', () => {
    expect(resolveTelegramIdentity({})).toBeNull();
  });

  it('normalizes sender fields into a stable auth identity', () => {
    expect(
      resolveTelegramIdentity({
        from: {
          id: 42,
          is_bot: false,
          first_name: 'Ada',
          last_name: 'Lovelace',
          username: 'ada',
          language_code: 'ru-RU',
        },
      }),
    ).toEqual({
      provider: 'telegram',
      channel: 'telegram_bot',
      providerSubject: '42',
      username: 'ada',
      displayName: 'Ada Lovelace',
      locale: 'ru',
      avatarUrl: null,
    });
  });

  it('keeps nullable optional profile fields explicit', () => {
    expect(
      resolveTelegramIdentity({
        from: {
          id: 100,
          is_bot: false,
          first_name: '',
          language_code: 'unsupported',
        },
      }),
    ).toMatchObject({
      username: null,
      displayName: null,
      locale: null,
    });
  });
});
