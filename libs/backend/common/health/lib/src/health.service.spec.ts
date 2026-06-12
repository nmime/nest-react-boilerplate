import { describe, expect, it } from "vitest";
import {
  hasRequiredReadinessFailure,
  HealthService,
  resolveHealthStatus,
  sanitizeHealthDetails,
  toHealthResponseDto,
} from "./health.service";
import type { HealthIndicatorResult, HealthResponse } from "./dto";

describe("HealthService", () => {
  it("returns app-aware DTO envelopes preserving current API response contracts", async () => {
    const service = new HealthService({
      appName: "admin-app-api",
      indicators: [
        {
          name: "postgres",
          check: () => ({ name: "postgres", status: "ok" }),
        },
      ],
    });

    const response = await service.checkEnvelope("ready");

    expect(response.data).toMatchObject({
      app: "admin-app-api",
      status: "ok",
      dependencies: [{ name: "postgres", status: "ok", required: true }],
      checks: [{ name: "postgres", status: "ok", required: true }],
    });
    expect(typeof response.data.uptime).toBe("number");
    expect(new Date(response.data.timestamp ?? "").toString()).not.toBe(
      "Invalid Date",
    );
  });

  it("aggregates required errors as error and optional errors as degraded", () => {
    expect(
      resolveHealthStatus([
        { name: "runtime", status: "ok" },
        { name: "cache", status: "error", required: false },
      ]),
    ).toBe("degraded");

    expect(
      resolveHealthStatus([
        { name: "runtime", status: "ok" },
        { name: "postgres", status: "error", required: true },
      ]),
    ).toBe("error");

    expect(
      resolveHealthStatus([
        { name: "runtime", status: "ok" },
        { name: "i18n", status: "skipped", required: false },
      ]),
    ).toBe("ok");
  });

  it("sanitizes unsafe details and raw indicator exceptions", async () => {
    const service = new HealthService({
      appName: "api",
      indicators: [
        {
          name: "unsafe",
          check: () => ({
            name: "unsafe",
            status: "degraded",
            details: {
              password: "super-secret",
              nested: { accessToken: "token-value", safe: "visible" },
            },
          }),
        },
        {
          name: "throws",
          check: () => {
            throw new Error("password=super-secret host=10.0.0.1");
          },
        },
      ],
    });

    const response = await service.check("ready");

    expect(response.checks[0]?.details).toEqual({
      password: "[redacted]",
      nested: { accessToken: "[redacted]", safe: "visible" },
    });
    expect(response.checks[1]).toMatchObject({
      name: "throws",
      status: "error",
      details: { message: "Health indicator failed." },
    });
  });

  it("exposes readiness failure semantics only for mandatory error checks", () => {
    const optionalFailure: HealthResponse = {
      status: "degraded",
      uptime: 1,
      timestamp: "2026-01-01T00:00:00.000Z",
      checks: [{ name: "cache", status: "error", required: false }],
    };
    const mandatoryFailure: HealthResponse = {
      ...optionalFailure,
      status: "error",
      checks: [{ name: "postgres", status: "error", required: true }],
    };

    expect(hasRequiredReadinessFailure(optionalFailure)).toBe(false);
    expect(hasRequiredReadinessFailure(mandatoryFailure)).toBe(true);
  });

  it("maps raw health responses to DTO dependencies and checks", () => {
    const check: HealthIndicatorResult = {
      name: "postgres",
      status: "error",
      required: true,
      details: { message: "PostgreSQL readiness check failed." },
    };

    expect(
      toHealthResponseDto("backend-user-app-api", {
        status: "error",
        uptime: 1,
        timestamp: "2026-01-01T00:00:00.000Z",
        checks: [check],
      }),
    ).toEqual({
      data: {
        app: "backend-user-app-api",
        status: "error",
        uptime: 1,
        timestamp: "2026-01-01T00:00:00.000Z",
        dependencies: [
          {
            name: "postgres",
            status: "error",
            detail: "PostgreSQL readiness check failed.",
            details: { message: "PostgreSQL readiness check failed." },
            required: true,
          },
        ],
        checks: [check],
      },
    });
  });

  it("redacts health details by unsafe key without removing safe fields", () => {
    expect(
      sanitizeHealthDetails({
        safe: "ok",
        apiSecret: "secret",
        items: [{ privateKey: "key", name: "public" }],
      }),
    ).toEqual({
      safe: "ok",
      apiSecret: "[redacted]",
      items: [{ privateKey: "[redacted]", name: "public" }],
    });
  });
});
