import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { NodeAesGcmProviderTokenCrypto, type ProviderTokenCryptoKey } from './provider-token-crypto.service';

function keyResolver(keyId = 'key-2026-07'): () => ProviderTokenCryptoKey {
  const key = randomBytes(32);
  return () => ({ keyId, key });
}

describe('NodeAesGcmProviderTokenCrypto', () => {
  it('round-trips plaintext without additional authenticated data', () => {
    const crypto = new NodeAesGcmProviderTokenCrypto(keyResolver());

    const encrypted = crypto.encrypt({ plaintext: 'discord-refresh-token' });

    expect(encrypted.keyId).toBe('key-2026-07');
    expect(typeof encrypted.ciphertext).toBe('string');
    expect(typeof encrypted.iv).toBe('string');
    expect(typeof encrypted.authTag).toBe('string');
    expect(encrypted.ciphertext).not.toContain('discord-refresh-token');

    expect(crypto.decrypt(encrypted)).toBe('discord-refresh-token');
  });

  it('round-trips plaintext bound to additional authenticated data', () => {
    const crypto = new NodeAesGcmProviderTokenCrypto(keyResolver());
    const aad = 'tenant:user:external-identity';

    const encrypted = crypto.encrypt({
      plaintext: 'discord-access-token',
      aad,
    });

    expect(crypto.decrypt({ ...encrypted, aad })).toBe('discord-access-token');
  });

  it('fails to decrypt when the additional authenticated data does not match', () => {
    const crypto = new NodeAesGcmProviderTokenCrypto(keyResolver());
    const encrypted = crypto.encrypt({
      plaintext: 'discord-access-token',
      aad: 'correct-aad',
    });

    expect(() => crypto.decrypt({ ...encrypted, aad: 'tampered-aad' })).toThrow();
  });

  it('fails to decrypt when the authentication tag has been tampered with', () => {
    const crypto = new NodeAesGcmProviderTokenCrypto(keyResolver());
    const encrypted = crypto.encrypt({ plaintext: 'discord-access-token' });
    const forgedAuthTag = Buffer.alloc(16, 0).toString('base64');

    expect(() => crypto.decrypt({ ...encrypted, authTag: forgedAuthTag })).toThrow();
  });
});
