import { Controller, Get } from "@nestjs/common";
import { createOkResponse, type OkResponse } from "@app/common/response";

export interface HealthPayload {
  app: "backend-admin-app-api";
  status: "ok";
}

@Controller("health")
export class HealthController {
  @Get()
  health(): OkResponse<HealthPayload> {
    return createOkResponse({ app: "backend-admin-app-api", status: "ok" });
  }
}
