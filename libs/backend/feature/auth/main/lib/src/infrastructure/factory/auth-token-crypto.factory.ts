import { createHash, randomBytes } from 'node:crypto';

export function createOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

// The input is always a `createOpaqueToken()` value: 256 bits of CSPRNG output, never a
// human-chosen secret. Slow hashes (argon2, bcrypt) buy resistance to brute force over a small
// guess space, which does not exist here — and they would charge that cost on every token lookup.
// CodeQL reaches this sink from `issuePasswordResetToken` and reads the name as a password.
export function hashOpaqueToken(token: string): string {
  // codeql[js/insufficient-password-hash]
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
