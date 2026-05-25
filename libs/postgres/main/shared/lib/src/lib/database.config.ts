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

export function readBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function readPort(value: string | undefined): number {
  if (value === undefined) {
    return DefaultPostgresPort;
  }

  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid POSTGRES_PORT: ${value}`);
  }

  return parsed;
}

export function readSslRejectUnauthorized(env: PostgresEnvironment): boolean {
  return readBoolean(env.POSTGRES_SSL_REJECT_UNAUTHORIZED) ?? true;
}
