// @requirements REQ-NOTIFY-PERSISTENCE-005
// Evidence for: REQ-NOTIFY-PERSISTENCE-005
import { describe, expect, it } from 'vitest';
// Persistence-focused evidence for REQ-NOTIFY-LIFECYCLE-002.
import { NotificationPayloadCryptoService } from './notification-payload-crypto.service';

describe(NotificationPayloadCryptoService.name, () => {
  it.each([4, 8, 12, 15, 17])('rejects an authentication tag of %i bytes', (length) => {
    const crypto = new NotificationPayloadCryptoService({
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
  it('encrypts confidential data and authenticates it to the notification target', () => {
    const crypto = new NotificationPayloadCryptoService({
      NOTIFICATION_PAYLOAD_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
      NOTIFICATION_PAYLOAD_ENCRYPTION_KEY_ID: 'test-key',
    });
    const encrypted = crypto.encrypt({ code: '654321' }, 'notification:id:user:user-1');

    expect(encrypted).toMatchObject({ keyId: 'test-key' });
    expect(encrypted.ciphertext).not.toContain('654321');
    expect(crypto.decrypt(encrypted, 'notification:id:user:user-1')).toEqual({ code: '654321' });
    expect(() => crypto.decrypt(encrypted, 'notification:id:user:user-2')).toThrow();
  });
});
