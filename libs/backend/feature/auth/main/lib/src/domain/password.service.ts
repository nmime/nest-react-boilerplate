import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

const PasswordIterations = 120_000;
const PasswordKeyLength = 32;
const MaximumPasswordHashIterations = 1_000_000;
const MaximumPasswordDigestLength = 128;

export function hashPassword(
  password: string,
  salt = randomBytes(16).toString("base64url"),
): string {
  const digest = pbkdf2Sync(
    password,
    salt,
    PasswordIterations,
    PasswordKeyLength,
    "sha256",
  ).toString("base64url");
  return `pbkdf2_sha256$${PasswordIterations}$${salt}$${digest}`;
}

export function verifyPassword(password: string, encodedHash: string): boolean {
  const [algorithm, iterations, salt, expectedDigest] = encodedHash.split("$");
  if (algorithm !== "pbkdf2_sha256" || !salt || !expectedDigest) {
    return false;
  }

  const parsedIterations = parsePasswordHashIterations(iterations);
  if (!parsedIterations) {
    return false;
  }

  let expected: Buffer;
  try {
    expected = Buffer.from(expectedDigest, "base64url");
  } catch {
    return false;
  }

  if (expected.length === 0 || expected.length > MaximumPasswordDigestLength) {
    return false;
  }

  const digest = pbkdf2Sync(
    password,
    salt,
    parsedIterations,
    expected.length,
    "sha256",
  );
  return digest.length === expected.length && timingSafeEqual(digest, expected);
}

function parsePasswordHashIterations(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (
    !Number.isInteger(parsed) ||
    String(parsed) !== value ||
    parsed < 1 ||
    parsed > MaximumPasswordHashIterations
  ) {
    return null;
  }

  return parsed;
}
