import { NodeAesGcmProviderTokenCrypto } from '@app/backend-feature-auth-shared';

export { NodeAesGcmProviderTokenCrypto } from '@app/backend-feature-auth-shared';

export interface ProviderTokenPlaintext {
  plaintext: string;
  aad?: string;
}

export interface ProviderTokenCiphertext {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyId: string;
}

export interface ProviderTokenCryptoKey {
  keyId: string;
  key: Buffer;
}

export interface ProviderTokenCrypto {
  encrypt(input: ProviderTokenPlaintext): ProviderTokenCiphertext;
  decrypt(input: ProviderTokenCiphertext & { aad?: string }): string;
}

export const createNodeAesGcmProviderTokenCrypto = (keyResolver: () => ProviderTokenCryptoKey): ProviderTokenCrypto =>
  new NodeAesGcmProviderTokenCrypto(keyResolver);
