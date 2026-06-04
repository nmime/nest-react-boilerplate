import { MikroORM } from "@mikro-orm/core";
import {
  Controller,
  Get,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ApiOkResponse } from "@nestjs/swagger";
import { createOkResponse, type OkResponse } from "@app/common/response";

const postgresReadinessFailureDetail = "PostgreSQL readiness check failed.";

export interface HealthDependency {
  name: "postgres";
  status: "ok" | "unavailable";
  detail?: string;
}

export interface HealthPayload {
  app: "auth-app-api";
  status: "ok" | "degraded";
  dependencies?: HealthDependency[];
}

@Controller()
export class HealthController {
  constructor(@Optional() private readonly orm?: MikroORM) {}

  @Get("health")
  @ApiOkResponse({ description: "Auth API health check succeeded." })
  health(): OkResponse<HealthPayload> {
    return this.live();
  }

  @Get("live")
  @ApiOkResponse({ description: "Auth API liveness check succeeded." })
  live(): OkResponse<HealthPayload> {
    return createOkResponse({ app: "auth-app-api", status: "ok" });
  }

  @Get("ready")
  @ApiOkResponse({ description: "Auth API readiness check succeeded." })
  async ready(): Promise<OkResponse<HealthPayload>> {
    const postgres = await this.checkPostgres();
    const dependencies = postgres ? [postgres] : undefined;
    const degraded = dependencies?.some(
      (dependency) => dependency.status !== "ok",
    );
    const payload: HealthPayload = {
      app: "auth-app-api",
      status: degraded ? "degraded" : "ok",
      ...(dependencies ? { dependencies } : {}),
    };

    if (degraded) {
      throw new ServiceUnavailableException(payload);
    }

    return createOkResponse(payload);
  }

  private async checkPostgres(): Promise<HealthDependency | undefined> {
    if (!this.orm) {
      return undefined;
    }

    try {
      await this.orm.em.getConnection().execute("select 1");
      return { name: "postgres", status: "ok" };
    } catch {
      return {
        name: "postgres",
        status: "unavailable",
        detail: postgresReadinessFailureDetail,
      };
    }
  }
}
