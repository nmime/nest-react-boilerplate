import { Module } from "@nestjs/common";
import type { DynamicModule, Provider } from "@nestjs/common";
import { AnalyticsConfigModule, AnalyticsConfigService } from "./config";
import { AnalyticsService } from "./analytics.service";
import type { AnalyticsConfig } from "./type";

@Module({
  imports: [AnalyticsConfigModule],
  providers: [AnalyticsService],
  exports: [AnalyticsConfigModule, AnalyticsService],
})
export class AnalyticsModule {
  static forRoot(config: AnalyticsConfig = {}): DynamicModule {
    const configServiceProvider: Provider = {
      provide: AnalyticsConfigService,
      useValue: new AnalyticsConfigService(config),
    };

    return {
      module: AnalyticsModule,
      providers: [configServiceProvider],
      exports: [AnalyticsConfigService, AnalyticsService],
    };
  }
}
