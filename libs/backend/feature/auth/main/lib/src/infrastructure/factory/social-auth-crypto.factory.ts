import { NodeAesGcmProviderTokenCrypto, type ProviderTokenCrypto } from '@app/backend-postgres-main-auth';

export function createEnvProviderTokenCrypto(): ProviderTokenCrypto | null {
  if (process.env.AUTH_PROVIDER_TOKEN_ENCRYPTION_ENABLED !== 'true') {
    return null;
  }
  const raw = process.env.AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    return null;
  }
  const key = Buffer.from(raw, raw.includes('=') ? 'base64' : 'hex');
  if (key.length !== 32) {
    return null;
  }
  return new NodeAesGcmProviderTokenCrypto(() => ({
    key,
    keyId: process.env.AUTH_PROVIDER_TOKEN_KEY_ID?.trim() || 'env',
  }));
}
