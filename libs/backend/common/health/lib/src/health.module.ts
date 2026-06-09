import { Module, type Type } from "@nestjs/common";
import { BaseHealthController } from "./base-health.controller";
import { HealthPrivateNetworkIpGuard } from "./guard";
import { HealthService } from "./health.service";
import type { HealthIndicator } from "./dto";

export interface HealthModuleOptions {
  indicators?: HealthIndicator[];
  controller?: Type<unknown>;
}

@Module({})
export class HealthModule {
  static forRoot(options: HealthModuleOptions = {}) {
    return {
      module: HealthModule,
      controllers: [options.controller ?? BaseHealthController],
      providers: [
        {
          provide: HealthService,
          useValue: new HealthService(options.indicators ?? []),
        },
        HealthPrivateNetworkIpGuard,
      ],
      exports: [HealthService],
    };
  }
}
