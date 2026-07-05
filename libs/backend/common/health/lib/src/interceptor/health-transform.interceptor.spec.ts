import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { firstValueFrom, of } from "rxjs";
import { describe, expect, it } from "vitest";
import { HealthTransformInterceptor } from "./health-transform.interceptor";
import type { HealthResponse } from "../dto";

describe("HealthTransformInterceptor", () => {
  it("passes the health response through the stream unchanged", async () => {
    const interceptor = new HealthTransformInterceptor();
    const context = {} as unknown as ExecutionContext;
    const response: HealthResponse = {
      status: "ok",
      uptime: 42,
      timestamp: "2026-01-01T00:00:00.000Z",
      checks: [{ name: "runtime", status: "ok" }],
    };
    const next: CallHandler<HealthResponse> = {
      handle: () => of(response),
    };

    const result = await firstValueFrom(interceptor.intercept(context, next));

    expect(result).toBe(response);
  });
});
