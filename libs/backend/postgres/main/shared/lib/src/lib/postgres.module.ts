import { MikroOrmModule } from "@mikro-orm/nestjs";
import { DynamicModule, Module } from "@nestjs/common";
import {
  createPostgresMikroOrmOptions,
  type PostgresMikroOrmOverrides,
} from "./data-source-options";
import {
  MikroOrmPostgresHealthAdapter,
  POSTGRES_HEALTH_ADAPTER,
  PostgresMigrationsHealthIndicator,
  PostgresReadinessHealthIndicator,
} from "./postgres.health";

@Module({})
export class PostgresMainModule {
  static forRoot(overrides: PostgresMikroOrmOverrides = {}): DynamicModule {
    return {
      module: PostgresMainModule,
      imports: [
        MikroOrmModule.forRoot(createPostgresMikroOrmOptions(overrides)),
      ],
      providers: [
        MikroOrmPostgresHealthAdapter,
        {
          provide: POSTGRES_HEALTH_ADAPTER,
          useExisting: MikroOrmPostgresHealthAdapter,
        },
        PostgresReadinessHealthIndicator,
        PostgresMigrationsHealthIndicator,
      ],
      exports: [
        POSTGRES_HEALTH_ADAPTER,
        PostgresReadinessHealthIndicator,
        PostgresMigrationsHealthIndicator,
      ],
    };
  }
}
