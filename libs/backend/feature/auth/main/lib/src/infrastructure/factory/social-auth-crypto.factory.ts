import { readFileSync } from 'node:fs';
import { NodeAesGcmProviderTokenCrypto, type ProviderTokenCrypto } from '@app/backend-postgres-main-auth';

export function createEnvProviderTokenCrypto(): ProviderTokenCrypto | null {
  if (process.env.AUTH_PROVIDER_TOKEN_ENCRYPTION_ENABLED !== 'true') {
    return null;
  }

  const inlineKey = process.env.AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY?.trim();
  const keyFile = process.env.AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY_FILE?.trim();
  if (inlineKey && keyFile) {
    throw new Error(
      'Configure only one of AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY or AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY_FILE.',
    );
  }
  if (!inlineKey && !keyFile) {
    throw new Error(
      'AUTH_PROVIDER_TOKEN_ENCRYPTION_ENABLED=true requires AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY or AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY_FILE.',
    );
  }

  let raw = inlineKey;
  if (keyFile) {
    try {
      raw = readFileSync(keyFile, 'utf8').trim();
    } catch (error) {
      throw new Error('Unable to read AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY_FILE.', { cause: error });
    }
  }

  const key = decodeProviderTokenKey(raw ?? '');
  if (key.length !== 32) {
    throw new Error('AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.');
  }
  return new NodeAesGcmProviderTokenCrypto(() => ({
    key,
    keyId: process.env.AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY_ID?.trim() || 'env',
  }));
}

function decodeProviderTokenKey(raw: string): Buffer {
  if (/^[0-9a-f]{64}$/iu.test(raw)) {
    return Buffer.from(raw, 'hex');
  }

  return Buffer.from(raw, 'base64');
}
