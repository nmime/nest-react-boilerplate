// @requirements REQ-AUTH-CREDENTIAL-003
import { describe, expect, it } from 'vitest';
import { AdminAuditLogTransactionError, NodeAesGcmProviderTokenCrypto } from './auth-persistence';

describe('auth persistence runtime helpers', () => {
  const key = Buffer.alloc(32, 7);

  it('encrypts and decrypts provider tokens with authenticated context', () => {
    const crypto = new NodeAesGcmProviderTokenCrypto(() => ({ keyId: 'key-1', key }));

    const encrypted = crypto.encrypt({ plaintext: 'provider-secret', aad: 'user-1:telegram' });

    expect(encrypted).toMatchObject({ keyId: 'key-1' });
    expect(encrypted.ciphertext).not.toContain('provider-secret');
    expect(Buffer.from(encrypted.iv, 'base64')).toHaveLength(12);
    expect(Buffer.from(encrypted.authTag, 'base64')).toHaveLength(16);
    expect(crypto.decrypt({ ...encrypted, aad: 'user-1:telegram' })).toBe('provider-secret');
    expect(() => crypto.decrypt({ ...encrypted, aad: 'user-2:telegram' })).toThrow();
  });

  it('supports provider tokens without additional authenticated data', () => {
    const crypto = new NodeAesGcmProviderTokenCrypto(() => ({ keyId: 'key-2', key }));

    const encrypted = crypto.encrypt({ plaintext: 'refresh-token' });

    expect(crypto.decrypt(encrypted)).toBe('refresh-token');
  });

  it('retains the cause of failed transactional audit work', () => {
    const cause = new Error('transaction rolled back');

    const error = new AdminAuditLogTransactionError(cause);

    expect(error).toMatchObject({
      cause,
      message: 'Admin audit transaction failed.',
      name: 'AdminAuditLogTransactionError',
    });
  });
});
