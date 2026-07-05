import { HttpStatus } from "@nestjs/common";
import type { HealthStatus } from "../dto";

export const HealthHttpStatus: Record<HealthStatus, number> = {
  ok: HttpStatus.OK,
  degraded: HttpStatus.OK,
  error: HttpStatus.SERVICE_UNAVAILABLE,
};
