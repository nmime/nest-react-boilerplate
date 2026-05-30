import { Controller, Get, UseGuards } from "@nestjs/common";
import { Health } from "./decorator";
import { HealthPrivateNetworkIpGuard } from "./guard";
import { HealthService } from "./health.service";
import type { HealthResponse } from "./dto";

@Controller("health")
export class BaseHealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @Health()
  getHealth(): Promise<HealthResponse> {
    return this.healthService.check();
  }

  @Get("private")
  @Health()
  @UseGuards(HealthPrivateNetworkIpGuard)
  getPrivateHealth(): Promise<HealthResponse> {
    return this.healthService.check();
  }
}
