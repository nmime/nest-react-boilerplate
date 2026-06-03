export interface PostgresEnvironment {
  DATABASE_URL?: string;
  POSTGRES_HOST?: string;
  POSTGRES_PORT?: string;
  POSTGRES_USER?: string;
  POSTGRES_PASSWORD?: string;
  POSTGRES_DB?: string;
  POSTGRES_SSL?: string;
  POSTGRES_SSL_REJECT_UNAUTHORIZED?: string;
  POSTGRES_SYNCHRONIZE?: string;
  POSTGRES_LOGGING?: string;
}

export const DefaultPostgresHost = "localhost";
export const DefaultPostgresPort = 5432;
export const DefaultPostgresUser = "postgres";
export const DefaultPostgresDatabase = "postgres";

export function readBoolean(
  value: string | undefined,
  name = "boolean value",
): boolean | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  switch (normalized) {
    case "1":
    case "true":
    case "yes":
    case "on":
      return true;
    case "0":
    case "false":
    case "no":
    case "off":
      return false;
    default:
      throw new Error(`${name} must be a boolean value.`);
  }
}

export function readPort(value: string | undefined): number {
  if (value === undefined) {
    return DefaultPostgresPort;
  }

  const trimmed = value.trim();
  const parsed = Number.parseInt(trimmed, 10);

  if (
    !Number.isInteger(parsed) ||
    String(parsed) !== trimmed ||
    parsed < 1 ||
    parsed > 65535
  ) {
    throw new Error(`Invalid POSTGRES_PORT: ${value}`);
  }

  return parsed;
}

export function readSslRejectUnauthorized(env: PostgresEnvironment): boolean {
  return (
    readBoolean(
      env.POSTGRES_SSL_REJECT_UNAUTHORIZED,
      "POSTGRES_SSL_REJECT_UNAUTHORIZED",
    ) ?? true
  );
}
