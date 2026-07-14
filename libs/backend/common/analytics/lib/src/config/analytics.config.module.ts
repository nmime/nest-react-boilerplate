import { Global, Module } from '@nestjs/common';
import { AnalyticsConfigService } from './analytics.config.service';

@Global()
@Module({
  // AnalyticsConfigService's only constructor parameter is a type-only interface,
  // so registering it as a bare class makes Nest try to resolve `Object` from DI
  // and fail. A factory sidesteps constructor metadata and uses the default.
  providers: [
    {
      provide: AnalyticsConfigService,
      useFactory: () => new AnalyticsConfigService(),
    },
  ],
  exports: [AnalyticsConfigService],
})
export class AnalyticsConfigModule {}
