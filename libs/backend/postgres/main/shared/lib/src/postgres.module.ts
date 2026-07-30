import { MikroOrmModule } from '@mikro-orm/nestjs';
import { DynamicModule, Global, Module, type OnModuleInit } from '@nestjs/common';
import {
  assertDurableDatabaseEnvironment,
  DurableDatabaseRuntimeInjectToken,
  type BackendSessionStoreOptions,
  type DurableDatabaseRuntime,
} from '@app/backend-common-bootstrap';
import { createPostgresMikroOrmOptions, type PostgresMikroOrmOverrides } from './data-source-options';
import {
  MikroOrmPostgresHealthAdapter,
  PostgresHealthAdapter,
  PostgresMigrationsHealthIndicator,
  PostgresReadinessHealthIndicator,
} from './postgres.health';
import { PostgresSessionStore } from './postgres-session.store';

class PostgresDurableDatabaseRuntime implements DurableDatabaseRuntime, OnModuleInit {
  readonly provider = 'postgres' as const;

  constructor(readiness: PostgresReadinessHealthIndicator, migrations: PostgresMigrationsHealthIndicator) {
    this.healthIndicators = [readiness, migrations];
  }

  readonly healthIndicators: DurableDatabaseRuntime['healthIndicators'];

  onModuleInit(): void {
    assertDurableDatabaseEnvironment(this.provider);
  }

  createSessionStore(options: BackendSessionStoreOptions): PostgresSessionStore {
    const databaseUrl = options.env.DATABASE_URL?.trim();
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required for PostgreSQL-backed server-side sessions.');
    }
    return new PostgresSessionStore(databaseUrl, options.defaultMaxAgeSeconds, options.sweepIntervalMs);
  }
}

@Global()
@Module({})
export class PostgresMainModule {
  static forRoot(overrides: PostgresMikroOrmOverrides = {}): DynamicModule {
    return {
      module: PostgresMainModule,
      imports: [MikroOrmModule.forRoot(createPostgresMikroOrmOptions(overrides))],
      providers: [
        MikroOrmPostgresHealthAdapter,
        {
          provide: PostgresHealthAdapter,
          useExisting: MikroOrmPostgresHealthAdapter,
        },
        PostgresReadinessHealthIndicator,
        PostgresMigrationsHealthIndicator,
        {
          provide: PostgresDurableDatabaseRuntime,
          inject: [PostgresReadinessHealthIndicator, PostgresMigrationsHealthIndicator],
          useFactory: (readiness: PostgresReadinessHealthIndicator, migrations: PostgresMigrationsHealthIndicator) =>
            new PostgresDurableDatabaseRuntime(readiness, migrations),
        },
        { provide: DurableDatabaseRuntimeInjectToken, useExisting: PostgresDurableDatabaseRuntime },
      ],
      exports: [
        PostgresHealthAdapter,
        PostgresReadinessHealthIndicator,
        PostgresMigrationsHealthIndicator,
        DurableDatabaseRuntimeInjectToken,
      ],
    };
  }
}
