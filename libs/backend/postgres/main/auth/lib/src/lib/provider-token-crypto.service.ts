import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

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

export class NodeAesGcmProviderTokenCrypto implements ProviderTokenCrypto {
  constructor(private readonly keyResolver: () => ProviderTokenCryptoKey) {}

  encrypt(input: ProviderTokenPlaintext): ProviderTokenCiphertext {
    const { keyId, key } = this.keyResolver();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    if (input.aad) {
      cipher.setAAD(Buffer.from(input.aad, "utf8"));
    }
    const ciphertext = Buffer.concat([
      cipher.update(input.plaintext, "utf8"),
      cipher.final(),
    ]);

    return {
      ciphertext: ciphertext.toString("base64"),
      iv: iv.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
      keyId,
    };
  }

  decrypt(input: ProviderTokenCiphertext & { aad?: string }): string {
    const { key } = this.keyResolver();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(input.iv, "base64"),
    );
    if (input.aad) {
      decipher.setAAD(Buffer.from(input.aad, "utf8"));
    }
    decipher.setAuthTag(Buffer.from(input.authTag, "base64"));

    return Buffer.concat([
      decipher.update(Buffer.from(input.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  }
}
