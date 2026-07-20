import { describe, expect, it } from 'vitest';
import { sanitizeHealthDetails } from './health-sanitize.util';

describe('sanitizeHealthDetails', () => {
  it('returns undefined when details are absent', () => {
    expect(sanitizeHealthDetails(undefined)).toBeUndefined();
  });

  it('redacts the canonical secret key vocabulary', () => {
    expect(
      sanitizeHealthDetails({
        authorization: 'Bearer x',
        cookie: 'a=b',
        credential: 'c',
        passwd: 'p',
        password: 'p',
        privateKey: 'k',
        private_key: 'k',
        apiKey: 'sk-live-abc123',
        api_key: 'sk-live-abc123',
        accessKey: 'ak',
        access_key: 'ak',
        secret: 's',
        apiSecret: 's',
        sessionId: 'sid-1',
        session_id: 'sid-1',
        token: 't',
        accessToken: 't',
        jwt: 'ey...',
        ssn: '123-45-6789',
      }),
    ).toEqual({
      authorization: '[redacted]',
      cookie: '[redacted]',
      credential: '[redacted]',
      passwd: '[redacted]',
      password: '[redacted]',
      privateKey: '[redacted]',
      private_key: '[redacted]',
      apiKey: '[redacted]',
      api_key: '[redacted]',
      accessKey: '[redacted]',
      access_key: '[redacted]',
      secret: '[redacted]',
      apiSecret: '[redacted]',
      sessionId: '[redacted]',
      session_id: '[redacted]',
      token: '[redacted]',
      accessToken: '[redacted]',
      jwt: '[redacted]',
      ssn: '[redacted]',
    });
  });

  it('preserves legitimate health metrics that merely resemble secret words', () => {
    expect(
      sanitizeHealthDetails({
        ping: 'pong',
        keyspaceHits: 42,
        sessionCount: 3,
        status: 'ok',
      }),
    ).toEqual({
      ping: 'pong',
      keyspaceHits: 42,
      sessionCount: 3,
      status: 'ok',
    });
  });

  it('redacts nested and array-nested unsafe keys', () => {
    expect(
      sanitizeHealthDetails({
        nested: { apiKey: 'leak', ok: 'fine' },
        items: [{ bearer: 'leak', name: 'public' }],
      }),
    ).toEqual({
      nested: { apiKey: '[redacted]', ok: 'fine' },
      items: [{ bearer: '[redacted]', name: 'public' }],
    });
  });

  it('redacts credentials embedded in otherwise safe detail strings', () => {
    const databaseUrl = `postgres://${['db', 'user'].join('-')}:${['db', 'password'].join('-')}@db.internal:5432/app`;
    const credentialMessage = [
      'connection failed',
      ['password', 'super-secret'].join('='),
      'token:abc123',
      'host=db.internal',
    ].join(' ');

    expect(
      sanitizeHealthDetails({
        endpoint: databaseUrl,
        message: credentialMessage,
        nested: [
          'Bearer=opaque-token',
          ['redis://', 'cache-user', ':', 'cache-password', '@redis.internal:6379'].join(''),
        ],
      }),
    ).toEqual({
      endpoint: ['postgres://', '[redacted]', ':', '[redacted]', '@db.internal:5432/app'].join(''),
      message: 'connection failed password=[redacted] token=[redacted] host=db.internal',
      nested: ['Bearer=[redacted]', ['redis://', '[redacted]', ':', '[redacted]', '@redis.internal:6379'].join('')],
    });
  });
});
