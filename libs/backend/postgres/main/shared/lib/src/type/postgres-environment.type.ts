export interface PostgresEnvironment {
  DATABASE_URL?: string;
  POSTGRES_HOST: string;
  POSTGRES_PORT: number;
  POSTGRES_USER: string;
  POSTGRES_PASSWORD: string;
  POSTGRES_DB: string;
  POSTGRES_SSL: boolean;
  POSTGRES_SSL_REJECT_UNAUTHORIZED: boolean;
  POSTGRES_SYNCHRONIZE?: boolean;
  POSTGRES_LOGGING: boolean;
  POSTGRES_POOL_MIN: number;
  POSTGRES_POOL_MAX: number;
  POSTGRES_POOL_IDLE_TIMEOUT_MS: number;
  POSTGRES_SLOW_QUERY_MS?: number;
}
