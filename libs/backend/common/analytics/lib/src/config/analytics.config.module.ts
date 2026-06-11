import { Global, Module } from "@nestjs/common";
import { AnalyticsConfigService } from "./analytics.config.service";

@Global()
@Module({
  providers: [AnalyticsConfigService],
  exports: [AnalyticsConfigService],
})
export class AnalyticsConfigModule {}
