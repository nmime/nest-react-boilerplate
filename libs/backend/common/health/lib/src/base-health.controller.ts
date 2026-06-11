import {
  Controller,
  Get,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { Health } from "./decorator";
import { HealthPrivateNetworkIpGuard } from "./guard";
import { hasRequiredReadinessFailure, HealthService } from "./health.service";
import type { HealthResponse, HealthResponseDto } from "./dto";

@Controller()
export class BaseHealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get("health")
  @Health()
  getHealth(): Promise<HealthResponse> {
    return this.healthService.check("health");
  }

  @Get("health/private")
  @Health()
  @UseGuards(HealthPrivateNetworkIpGuard)
  getPrivateHealth(): Promise<HealthResponseDto> {
    return this.healthService.checkPrivate();
  }

  @Get("live")
  @Health()
  getLiveness(): Promise<HealthResponseDto> {
    return this.healthService.checkLiveness();
  }

  @Get("ready")
  @Health()
  async getReadiness(): Promise<HealthResponseDto> {
    const response = await this.healthService.checkReadiness();

    if (hasRequiredReadinessFailure(response)) {
      throw new ServiceUnavailableException(response);
    }

    return response;
  }
}
