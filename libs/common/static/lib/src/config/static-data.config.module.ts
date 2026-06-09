import { Global, Module } from "@nestjs/common";
import { StaticDataConfigService } from "./static-data.config.service";

@Global()
@Module({
  providers: [StaticDataConfigService],
  exports: [StaticDataConfigService],
})
export class StaticDataConfigModule {}
