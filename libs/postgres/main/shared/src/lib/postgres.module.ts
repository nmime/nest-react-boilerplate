import { DynamicModule, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import type { PostgresConnectionOptions } from "typeorm/driver/postgres/PostgresConnectionOptions";
import { createPostgresDataSourceOptions } from "./data-source-options";

@Module({})
export class PostgresMainModule {
  static forRoot(
    overrides: Partial<PostgresConnectionOptions> = {},
  ): DynamicModule {
    return {
      module: PostgresMainModule,
      imports: [
        TypeOrmModule.forRoot(createPostgresDataSourceOptions(overrides)),
      ],
    };
  }
}
