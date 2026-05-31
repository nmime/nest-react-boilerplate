import { Module } from "@nestjs/common";
import { AnalyticsConfigService } from "./analytics.config.service";

@Module({
  providers: [AnalyticsConfigService],
  exports: [AnalyticsConfigService],
})
export class AnalyticsConfigModule {}
