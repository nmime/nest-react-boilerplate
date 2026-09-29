// @requirements REQ-NOTIFY-PERSISTENCE-005
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isEncryptedNotificationPayload } from './notification-mongo.documents';
import { NotificationMongoPayloadCryptoService } from './notification-payload-crypto.service';

describe('notification payload encryption boundaries', () => {
  it.each([4, 8, 12, 15, 17])('rejects an authentication tag of %i bytes', (length) => {
    const crypto = new NotificationMongoPayloadCryptoService({
      NOTIFICATION_PAYLOAD_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
    });
    const encrypted = crypto.encrypt({ code: '654321' }, 'notification:1');
    const authTag = Buffer.concat([Buffer.from(encrypted.authTag, 'base64'), Buffer.alloc(1)])
      .subarray(0, length)
      .toString('base64');
    expect(() => crypto.decrypt({ ...encrypted, authTag }, 'notification:1')).toThrow(
      'Invalid authentication tag length',
    );
  });
  it('refuses encrypting sensitive data without a key and rejects invalid keys at startup', () => {
    const unconfigured = new NotificationMongoPayloadCryptoService({});
    expect(() => unconfigured.encrypt({ code: 'protected' }, 'notification:1')).toThrow('exactly 32 bytes');
    expect(() => new NotificationMongoPayloadCryptoService({ NOTIFICATION_PAYLOAD_ENCRYPTION_KEY: 'invalid' })).toThrow(
      'exactly 32 bytes',
    );
  });

  it('loads a mounted hex key, records its identity, and authenticates the notification context', () => {
    const directory = mkdtempSync(join(tmpdir(), 'nrb-notification-key-'));
    try {
      const keyFile = join(directory, 'key');
      writeFileSync(keyFile, `  ${Buffer.alloc(32, 7).toString('hex')}\n`);
      const crypto = new NotificationMongoPayloadCryptoService({
        NOTIFICATION_PAYLOAD_ENCRYPTION_KEY_FILE: keyFile,
        NOTIFICATION_PAYLOAD_ENCRYPTION_KEY_ID: ' mounted-key ',
      });
      const encrypted = crypto.encrypt({ code: 'protected' }, 'notification:1');
      expect(encrypted.keyId).toBe('mounted-key');
      expect(crypto.decrypt(encrypted, 'notification:1')).toEqual({ code: 'protected' });
      expect(() => crypto.decrypt(encrypted, 'notification:2')).toThrow();
      expect(() =>
        crypto.decrypt({ ...encrypted, ciphertext: Buffer.from('tampered').toString('base64') }, 'notification:1'),
      ).toThrow();
      expect(() => new NotificationMongoPayloadCryptoService({}).decrypt(encrypted, 'notification:1')).toThrow(
        'exactly 32 bytes',
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects ambiguous and unreadable key sources with safe configuration errors', () => {
    expect(
      () =>
        new NotificationMongoPayloadCryptoService({
          NOTIFICATION_PAYLOAD_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
          NOTIFICATION_PAYLOAD_ENCRYPTION_KEY_FILE: '/missing/private-key',
        }),
    ).toThrow('Configure only one');
    expect(
      () =>
        new NotificationMongoPayloadCryptoService({ NOTIFICATION_PAYLOAD_ENCRYPTION_KEY_FILE: '/missing/private-key' }),
    ).toThrow('Unable to read NOTIFICATION_PAYLOAD_ENCRYPTION_KEY_FILE.');
  });

  it.each([
    undefined,
    'plaintext',
    null,
    {},
    { ciphertext: 1 },
    { ciphertext: 'a' },
    { ciphertext: 'a', iv: 'b' },
    { ciphertext: 'a', iv: 'b', authTag: 'c' },
  ])('rejects malformed encrypted envelopes: %j', (value) => {
    expect(isEncryptedNotificationPayload(value)).toBe(false);
  });

  it('recognizes a complete encrypted envelope', () => {
    expect(isEncryptedNotificationPayload({ ciphertext: 'a', iv: 'b', authTag: 'c', keyId: 'env' })).toBe(true);
  });
});
