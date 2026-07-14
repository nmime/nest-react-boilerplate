import { Injectable } from '@nestjs/common';
import { createConfig } from '@app/common-config';
import { schema } from './postgres-env.schema';
import type { PostgresEnvironment } from './type/postgres-environment.type';

export * from './const/postgres-database-default.const';
export * from './type/postgres-environment.type';
export * from './util/read-env.util';

@Injectable()
export class PostgresDatabaseConfigService {
  protected readonly configService = createConfig<PostgresEnvironment>(schema);

  get databaseUrl(): string | undefined {
    return this.configService.get('DATABASE_URL');
  }

  get host(): string {
    return this.configService.get('POSTGRES_HOST');
  }

  get port(): number {
    return this.configService.get('POSTGRES_PORT');
  }

  get user(): string {
    return this.configService.get('POSTGRES_USER');
  }

  get password(): string {
    return this.configService.get('POSTGRES_PASSWORD');
  }

  get database(): string {
    return this.configService.get('POSTGRES_DB');
  }

  get ssl(): boolean {
    return this.configService.get('POSTGRES_SSL');
  }

  get sslRejectUnauthorized(): boolean {
    return this.configService.get('POSTGRES_SSL_REJECT_UNAUTHORIZED');
  }

  get synchronize(): boolean | undefined {
    return this.configService.get('POSTGRES_SYNCHRONIZE');
  }

  get logging(): boolean {
    return this.configService.get('POSTGRES_LOGGING');
  }

  get poolMin(): number {
    return this.configService.get('POSTGRES_POOL_MIN');
  }

  get poolMax(): number {
    return this.configService.get('POSTGRES_POOL_MAX');
  }

  get poolIdleTimeoutMs(): number {
    return this.configService.get('POSTGRES_POOL_IDLE_TIMEOUT_MS');
  }

  get slowQueryMs(): number | undefined {
    return this.configService.get('POSTGRES_SLOW_QUERY_MS');
  }

  get values(): Readonly<PostgresEnvironment> {
    return this.configService.values;
  }
}

export function createPostgresEnvironment(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): Readonly<PostgresEnvironment> {
  return createConfig<PostgresEnvironment>(schema, { env }).values;
}
