import { MikroOrmModule } from '@mikro-orm/nestjs';
import { DynamicModule, Global, Module } from '@nestjs/common';
import { createPostgresMikroOrmOptions, type PostgresMikroOrmOverrides } from './data-source-options';
import {
  MikroOrmPostgresHealthAdapter,
  PostgresHealthAdapter,
  PostgresMigrationsHealthIndicator,
  PostgresReadinessHealthIndicator,
} from './postgres.health';

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
      ],
      exports: [PostgresHealthAdapter, PostgresReadinessHealthIndicator, PostgresMigrationsHealthIndicator],
    };
  }
}
