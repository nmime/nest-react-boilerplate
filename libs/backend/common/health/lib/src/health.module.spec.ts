import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { BaseHealthController } from "./base-health.controller";
import { HealthModule } from "./health.module";
import { HealthService } from "./health.service";

class CustomHealthController extends BaseHealthController {}

describe("HealthModule", () => {
  it("registers the base controller, service, guard, and runtime indicator by default", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HealthModule.forRoot({ appName: "api" })],
    }).compile();

    const service = moduleRef.get(HealthService);

    await expect(service.checkEnvelope("ready")).resolves.toMatchObject({
      data: {
        app: "api",
        status: "ok",
        checks: [{ name: "runtime", status: "ok", required: true }],
      },
    });
    expect(moduleRef.get(BaseHealthController)).toBeInstanceOf(
      BaseHealthController,
    );
  });

  it("keeps the configurable controller export backward-compatible", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        HealthModule.forRoot({
          appName: "api",
          controller: CustomHealthController,
          includeRuntimeIndicator: false,
        }),
      ],
    }).compile();

    expect(moduleRef.get(CustomHealthController)).toBeInstanceOf(
      CustomHealthController,
    );
    await expect(moduleRef.get(HealthService).check()).resolves.toMatchObject({
      status: "ok",
      checks: [],
    });
  });
});
