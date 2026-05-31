import { Module } from "@nestjs/common";
import { StaticDataConfigService } from "./static-data.config.service";

@Module({
  providers: [StaticDataConfigService],
  exports: [StaticDataConfigService],
})
export class StaticDataConfigModule {}
