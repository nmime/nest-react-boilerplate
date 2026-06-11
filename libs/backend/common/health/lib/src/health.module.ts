import { Module, type DynamicModule, type Type } from "@nestjs/common";
import { BaseHealthController } from "./base-health.controller";
import { HealthPrivateNetworkIpGuard } from "./guard";
import { HealthService, type HealthServiceOptions } from "./health.service";
import { RuntimeHealthIndicator } from "./indicator";
import type { HealthIndicator } from "./dto";

export interface HealthModuleOptions extends HealthServiceOptions {
  indicators?: HealthIndicator[];
  controller?: Type<unknown>;
  includeRuntimeIndicator?: boolean;
}

@Module({})
export class HealthModule {
  static forRoot(options: HealthModuleOptions = {}): DynamicModule {
    const indicators = [
      ...(options.includeRuntimeIndicator === false
        ? []
        : [new RuntimeHealthIndicator()]),
      ...(options.indicators ?? []),
    ];

    return {
      module: HealthModule,
      controllers: [options.controller ?? BaseHealthController],
      providers: [
        {
          provide: HealthService,
          useValue: new HealthService({
            appName: options.appName,
            indicators,
          }),
        },
        HealthPrivateNetworkIpGuard,
      ],
      exports: [HealthService],
    };
  }
}
