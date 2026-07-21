import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Inject, Injectable, Optional } from '@nestjs/common';
import type { NotificationSensitiveData } from '@app/common-notifications';
import type { EncryptedNotificationPayload } from './infrastructure/data-access/entities';

/** Encrypts credentials kept in durable notification payloads with AES-256-GCM. */
export const NotificationPayloadEnvironmentInjectToken = Symbol('NotificationPayloadEnvironmentInjectToken');

@Injectable()
export class NotificationPayloadCryptoService {
  private readonly key: Buffer | null;
  private readonly keyId: string;

  constructor(
    @Optional()
    @Inject(NotificationPayloadEnvironmentInjectToken)
    env: NodeJS.ProcessEnv = process.env,
  ) {
    this.key = readKey(readKeySource(env));
    this.keyId = env.NOTIFICATION_PAYLOAD_ENCRYPTION_KEY_ID?.trim() || 'env';
  }

  encrypt(input: NotificationSensitiveData, aad: string): EncryptedNotificationPayload {
    const key = this.requireKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(aad, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(input), 'utf8'), cipher.final()]);
    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      keyId: this.keyId,
    };
  }

  decrypt(input: EncryptedNotificationPayload, aad: string): NotificationSensitiveData {
    const key = this.requireKey();
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(input.iv, 'base64'));
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(Buffer.from(input.authTag, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(input.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
    return JSON.parse(plaintext) as NotificationSensitiveData;
  }

  isConfigured(): boolean {
    return this.key !== null;
  }

  private requireKey(): Buffer {
    if (!this.key) {
      throw new Error('NOTIFICATION_PAYLOAD_ENCRYPTION_KEY must decode to exactly 32 bytes.');
    }
    return this.key;
  }
}

function readKeySource(env: NodeJS.ProcessEnv): string | undefined {
  const value = env.NOTIFICATION_PAYLOAD_ENCRYPTION_KEY?.trim();
  const keyFile = env.NOTIFICATION_PAYLOAD_ENCRYPTION_KEY_FILE?.trim();
  if (value && keyFile) {
    throw new Error(
      'Configure only one of NOTIFICATION_PAYLOAD_ENCRYPTION_KEY or NOTIFICATION_PAYLOAD_ENCRYPTION_KEY_FILE.',
    );
  }
  if (!keyFile) {
    return value;
  }
  try {
    return readFileSync(keyFile, 'utf8').trim();
  } catch {
    throw new Error('Unable to read NOTIFICATION_PAYLOAD_ENCRYPTION_KEY_FILE.');
  }
}

function readKey(value: string | undefined): Buffer | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }
  const key = /^[0-9a-f]{64}$/iu.test(normalized) ? Buffer.from(normalized, 'hex') : Buffer.from(normalized, 'base64');
  if (key.byteLength !== 32) {
    throw new Error('NOTIFICATION_PAYLOAD_ENCRYPTION_KEY must decode to exactly 32 bytes.');
  }
  return key;
}
