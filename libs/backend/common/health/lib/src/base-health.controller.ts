import { Controller, Get, UseGuards } from '@nestjs/common';
import { Health } from './decorator';
import { HealthPrivateNetworkIpGuard } from './guard';
import { HealthService } from './health.service';
import type { HealthResponse, HealthResponseDto } from './dto';

/* v8 ignore start -- the method decorators (@Get/@Health/@UseGuards) make esbuild emit the full __decorateClass helper whose `kind > 1` accessor/parameter slot is unreachable: this controller only uses class- and method-kind decorators. */
@Controller()
/* v8 ignore stop */
export class BaseHealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('health')
  @Health()
  getHealth(): Promise<HealthResponse> {
    return this.healthService.check('health');
  }

  @Get('health/private')
  @Health()
  @UseGuards(HealthPrivateNetworkIpGuard)
  getPrivateHealth(): Promise<HealthResponseDto> {
    return this.healthService.checkPrivate();
  }

  @Get('live')
  @Health()
  getLiveness(): Promise<HealthResponseDto> {
    return this.healthService.checkLiveness();
  }

  @Get('ready')
  @Health()
  getReadiness(): Promise<HealthResponseDto> {
    return this.healthService.checkReadiness();
  }
}
