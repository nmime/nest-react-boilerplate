import { Global, Module } from "@nestjs/common";
import { PostgresDatabaseConfigService } from "./database.config";

@Global()
@Module({
  providers: [PostgresDatabaseConfigService],
  exports: [PostgresDatabaseConfigService],
})
export class PostgresConfigModule {}
