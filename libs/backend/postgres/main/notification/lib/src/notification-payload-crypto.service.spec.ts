import { describe, expect, it } from 'vitest';
import { NotificationPayloadCryptoService } from './notification-payload-crypto.service';

describe(NotificationPayloadCryptoService.name, () => {
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
