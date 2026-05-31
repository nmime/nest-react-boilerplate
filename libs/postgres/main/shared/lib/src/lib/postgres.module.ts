import { MikroOrmModule } from "@mikro-orm/nestjs";
import { DynamicModule, Module } from "@nestjs/common";
import {
  createPostgresMikroOrmOptions,
  type PostgresMikroOrmOverrides,
} from "./data-source-options";

@Module({})
export class PostgresMainModule {
  static forRoot(overrides: PostgresMikroOrmOverrides = {}): DynamicModule {
    return {
      module: PostgresMainModule,
      imports: [
        MikroOrmModule.forRoot(createPostgresMikroOrmOptions(overrides)),
      ],
    };
  }
}
