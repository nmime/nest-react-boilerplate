// @requirements REQ-RUNTIME-LIFECYCLE-004
import { describe, expect, it, vi } from 'vitest';
import {
  assertDurableDatabaseEnvironment,
  completeSessionGet,
  completeSessionMutation,
  resolveSessionExpiry,
  reviveSession,
  serializeSession,
} from './durable-database.runtime';

type Session = Parameters<typeof serializeSession>[0];

function sessionWithCookie(cookie: Record<string, unknown>): Session {
  return { cookie } as unknown as Session;
}

describe('durable database runtime', () => {
  it('accepts matching selectors and absent non-production selectors', () => {
    expect(() => {
      assertDurableDatabaseEnvironment('postgres', {});
    }).not.toThrow();
    expect(() => {
      assertDurableDatabaseEnvironment('postgres', {
        AUTH_PERSISTENCE: ' POSTGRES ',
        DATABASE_ENGINE: 'postgres',
        NODE_ENV: 'production',
      });
    }).not.toThrow();
    expect(() => {
      assertDurableDatabaseEnvironment('mongodb', {
        AUTH_PERSISTENCE: 'memory',
        DATABASE_ENGINE: 'memory',
      });
    }).not.toThrow();
  });

  it('rejects missing, invalid, and mismatched durable provider selectors', () => {
    expect(() => {
      assertDurableDatabaseEnvironment('postgres', { NODE_ENV: 'production' });
    }).toThrow('DATABASE_ENGINE and AUTH_PERSISTENCE must identify the compiled durable database provider.');
    expect(() => {
      assertDurableDatabaseEnvironment('postgres', {
        AUTH_PERSISTENCE: 'postgres',
        DATABASE_ENGINE: 'mongodb',
      });
    }).toThrow('DATABASE_ENGINE=mongodb does not match the compiled postgres provider.');
    expect(() => {
      assertDurableDatabaseEnvironment('postgres', {
        AUTH_PERSISTENCE: 'mongodb',
        DATABASE_ENGINE: 'postgres',
      });
    }).toThrow('AUTH_PERSISTENCE=mongodb does not match the compiled postgres provider.');
    expect(() => {
      assertDurableDatabaseEnvironment('postgres', { DATABASE_ENGINE: 'sqlite' });
    }).toThrow('DATABASE_ENGINE and AUTH_PERSISTENCE must be one of postgres or mongodb.');
  });

  it('completes session reads with either the session or the rejection', async () => {
    const session = sessionWithCookie({ maxAge: 1_000 });

    await new Promise<void>((resolve) => {
      completeSessionGet(Promise.resolve(session), (error, result) => {
        expect(error).toBeNull();
        expect(result).toBe(session);
        resolve();
      });
    });

    const failure = new Error('read failed');
    await new Promise<void>((resolve) => {
      completeSessionGet(Promise.reject(failure), (error, result) => {
        expect(error).toBe(failure);
        expect(result).toBeUndefined();
        resolve();
      });
    });
  });

  it('completes session mutations with either success or the rejection', async () => {
    await new Promise<void>((resolve) => {
      completeSessionMutation(Promise.resolve(), (error) => {
        expect(error).toBeUndefined();
        resolve();
      });
    });

    const failure = new Error('write failed');
    await new Promise<void>((resolve) => {
      completeSessionMutation(Promise.reject(failure), (error) => {
        expect(error).toBe(failure);
        resolve();
      });
    });
  });

  it('serializes sessions by value and revives valid cookie expiry timestamps', () => {
    const expires = new Date('2030-01-02T03:04:05.000Z');
    const source = {
      cookie: { expires },
      user: { id: 'user-1' },
    } as unknown as Session;

    const serialized = serializeSession(source);
    const revived = reviveSession(serialized);

    expect(serialized).not.toBe(source);
    expect((revived as unknown as { user: unknown }).user).not.toBe((source as unknown as { user: unknown }).user);
    expect(revived.cookie.expires).toEqual(expires);
    expect(revived.cookie.expires).toBeInstanceOf(Date);
  });

  it('preserves existing dates and invalid serialized expiry values', () => {
    const expires = new Date('2030-01-02T03:04:05.000Z');
    const withDate = sessionWithCookie({ expires });
    const withInvalidDate = sessionWithCookie({ expires: 'not-a-date' });

    expect(reviveSession(withDate).cookie.expires).toBe(expires);
    expect(reviveSession(withInvalidDate).cookie.expires).toBe('not-a-date');
    expect(reviveSession(sessionWithCookie({})).cookie.expires).toBeUndefined();
  });

  it('resolves expiry from a valid cookie timestamp before max-age settings', () => {
    const expires = new Date('2030-01-02T03:04:05.000Z');

    expect(resolveSessionExpiry(sessionWithCookie({ expires, originalMaxAge: 10 }), 60)).toBe(expires);
    expect(resolveSessionExpiry(sessionWithCookie({ expires: expires.toISOString(), maxAge: 10 }), 60)).toEqual(
      expires,
    );
  });

  it('falls back through original max age, max age, and the configured default', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    try {
      expect(
        resolveSessionExpiry(sessionWithCookie({ expires: 'invalid', maxAge: 2_000, originalMaxAge: 3_000 }), 4),
      ).toEqual(new Date('2026-01-01T00:00:03.000Z'));
      expect(resolveSessionExpiry(sessionWithCookie({ maxAge: 2_000, originalMaxAge: 0 }), 4)).toEqual(
        new Date('2026-01-01T00:00:02.000Z'),
      );
      expect(resolveSessionExpiry(sessionWithCookie({ maxAge: 0 }), 4)).toEqual(new Date('2026-01-01T00:00:04.000Z'));
    } finally {
      vi.useRealTimers();
    }
  });
});
