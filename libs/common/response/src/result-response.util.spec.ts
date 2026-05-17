import { BadRequestException, HttpStatus } from "@nestjs/common";
import { err, ok } from "neverthrow";
import { lastValueFrom, of, throwError } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { BaseException } from "@app/common/exception";
import {
  createOkResponse,
  createProblemResponse,
  isOkResponse,
  isProblemResponse,
  mapResultToResponse,
  mapValueToApiResponse,
  ProblemExceptionFilter,
  ProblemResponseTransformer,
} from "./index";

describe("problem response mapper", () => {
  it("wraps successful data", () => {
    expect(createOkResponse({ status: "ok" })).toEqual({
      data: { status: "ok" },
    });
  });

  it("creates RFC 7807 problem details", () => {
    expect(createProblemResponse("bad-request", "Invalid input")).toMatchObject(
      {
        code: "bad-request",
        detail: "Invalid input",
        status: 400,
        title: "Invalid input",
        type: "https://example.com/problems/bad-request",
      },
    );
  });

  it("maps neverthrow results to API responses", () => {
    expect(mapResultToResponse(ok("ready"))).toEqual({ data: "ready" });
    expect(
      mapResultToResponse(err({ code: "disabled", message: "OAuth disabled" })),
    ).toMatchObject({
      code: "disabled",
      detail: "OAuth disabled",
      status: 400,
      title: "OAuth disabled",
    });
    expect(
      mapResultToResponse(
        err(
          new BaseException({
            code: "conflict",
            status: HttpStatus.CONFLICT,
            title: "Conflict",
          }),
        ),
      ),
    ).toMatchObject({ code: "conflict", status: 409, title: "Conflict" });
    expect(mapResultToResponse(err(new Error("Boom")))).toMatchObject({
      code: "bad-request",
      detail: "The request could not be processed.",
      status: 400,
      title: "Bad Request",
      type: "https://example.com/problems/bad-request",
    });
    expect(mapResultToResponse(err(new Error("Boom")), "es")).toMatchObject({
      code: "bad-request",
      detail: "La solicitud no pudo procesarse.",
      status: 400,
      title: "Solicitud incorrecta",
    });
  });

  it("detects already mapped responses and maps result values", () => {
    expect(isOkResponse({ data: "value" })).toBe(true);
    expect(
      isProblemResponse({ type: "about:blank", title: "Bad", status: 400 }),
    ).toBe(true);
    expect(mapValueToApiResponse({ data: "value" })).toEqual({ data: "value" });
    expect(mapValueToApiResponse(ok("value"))).toEqual({ data: "value" });
    expect(mapValueToApiResponse("raw")).toBe("raw");
  });

  it("intercepts successful values and preserves thrown errors", async () => {
    const transformer = new ProblemResponseTransformer();
    await expect(
      lastValueFrom(
        transformer.intercept({} as never, { handle: () => of(ok("ready")) }),
      ),
    ).resolves.toEqual({ data: "ready" });
    await expect(
      lastValueFrom(
        transformer.intercept({} as never, {
          handle: () => throwError(() => new Error("boom")),
        }),
      ),
    ).rejects.toThrow("boom");
  });

  it("filters exceptions into problem+json responses", () => {
    const json = vi.fn();
    const type = vi.fn(() => ({ json }));
    const status = vi.fn(() => ({ type }));
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ originalUrl: "/bad" }),
        getResponse: () => ({ status }),
      }),
    };

    new ProblemExceptionFilter().catch(
      new BadRequestException("Invalid input"),
      host as never,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(type).toHaveBeenCalledWith("application/problem+json");
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ instance: "/bad", status: 400 }),
    );
  });

  it("uses request.url when originalUrl is unavailable", () => {
    const json = vi.fn();
    const type = vi.fn(() => ({ json }));
    const status = vi.fn(() => ({ type }));
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ url: "/fallback-url" }),
        getResponse: () => ({ status }),
      }),
    };

    new ProblemExceptionFilter().catch(new Error("boom"), host as never);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ instance: "/fallback-url", status: 500 }),
    );
  });
});
