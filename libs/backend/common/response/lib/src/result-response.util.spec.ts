import { BadRequestException, HttpStatus, Logger } from "@nestjs/common";
import { err, ok } from "neverthrow";
import { lastValueFrom, of, throwError } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { BaseException } from "@app/backend-common-exception";
import {
  createOkResponse,
  createProblemResponse,
  isOkResponse,
  isProblemResponse,
  mapResultToResponse,
  mapValueToApiResponse,
  ExceptionsFilter,
  ExceptionsResponseTransformer,
} from "./index";

const testValue = <T>(value: unknown): T => value as T;

describe("exceptions response mapper", () => {
  it("wraps successful data", () => {
    expect(createOkResponse({ status: "ok" })).toEqual({
      data: { status: "ok" },
    });
  });

  it("creates RFC 9457 problem details", () => {
    expect(createProblemResponse("bad-request", "Invalid input")).toMatchObject(
      {
        code: "bad-request",
        detail: "Invalid input",
        status: 400,
        title: "Bad Request",
        type: "urn:problem:nest-react-boilerplate:bad-request",
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
      title: "Bad Request",
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
      type: "urn:problem:nest-react-boilerplate:bad-request",
    });
    expect(mapResultToResponse(err(new Error("Boom")), "ru")).toMatchObject({
      code: "bad-request",
      detail: "The request could not be processed.",
      localizedDetail: "Запрос не может быть обработан.",
      status: 400,
      title: "Bad Request",
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
    const transformer = new ExceptionsResponseTransformer();
    const context = testValue<Parameters<typeof transformer.intercept>[0]>({});
    await expect(
      lastValueFrom(
        transformer.intercept(context, { handle: () => of(ok("ready")) }),
      ),
    ).resolves.toEqual({ data: "ready" });
    await expect(
      lastValueFrom(
        transformer.intercept(context, {
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

    new ExceptionsFilter().catch(
      new BadRequestException("Invalid input"),
      host as never,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(type).toHaveBeenCalledWith("application/problem+json");
    const badRequestBody: unknown = json.mock.calls[0]?.[0];
    expect(badRequestBody).not.toHaveProperty("instance");
    expect(badRequestBody).toMatchObject({
      code: "bad-request",
      status: 400,
      title: "Bad Request",
    });
  });

  it("supports Fastify replies that send instead of json", () => {
    const send = vi.fn();
    const header = vi.fn(() => ({ send }));
    const type = vi.fn(() => ({ header, send }));
    const status = vi.fn(() => ({ type }));
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ url: "/fastify" }),
        getResponse: () => ({ status }),
      }),
    };

    new ExceptionsFilter().catch(new Error("boom"), host as never);

    expect(status).toHaveBeenCalledWith(500);
    expect(type).toHaveBeenCalledWith("application/problem+json");
    expect(header).toHaveBeenCalledWith("content-language", "en");
    const fastifyBody: unknown = send.mock.calls[0]?.[0];
    expect(fastifyBody).not.toHaveProperty("instance");
    expect(fastifyBody).toMatchObject({
      status: 500,
      title: "Internal Server Error",
    });
  });

  it("logs 500 responses with the exception stack for production traceability", () => {
    const errorSpy = vi
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
    const debugSpy = vi
      .spyOn(Logger.prototype, "debug")
      .mockImplementation(() => undefined);
    const json = vi.fn();
    const type = vi.fn(() => ({ json }));
    const status = vi.fn(() => ({ type }));
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ url: "/boom" }),
        getResponse: () => ({ status }),
      }),
    };
    const boom = new Error("kaboom");

    new ExceptionsFilter().catch(boom, host as never);

    expect(status).toHaveBeenCalledWith(500);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("500"),
      boom.stack,
    );
    expect(debugSpy).not.toHaveBeenCalled();

    errorSpy.mockRestore();
    debugSpy.mockRestore();
  });

  it("logs expected 4xx problems at debug without error noise", () => {
    const errorSpy = vi
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
    const debugSpy = vi
      .spyOn(Logger.prototype, "debug")
      .mockImplementation(() => undefined);
    const json = vi.fn();
    const type = vi.fn(() => ({ json }));
    const status = vi.fn(() => ({ type }));
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ originalUrl: "/bad" }),
        getResponse: () => ({ status }),
      }),
    };

    new ExceptionsFilter().catch(
      new BadRequestException("Invalid input"),
      host as never,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(debugSpy).toHaveBeenCalledTimes(1);

    errorSpy.mockRestore();
    debugSpy.mockRestore();
  });

  it("does not use request.url as a problem instance", () => {
    const json = vi.fn();
    const type = vi.fn(() => ({ json }));
    const status = vi.fn(() => ({ type }));
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ url: "/fallback-url" }),
        getResponse: () => ({ status }),
      }),
    };

    new ExceptionsFilter().catch(new Error("boom"), host as never);

    const fallbackBody: unknown = json.mock.calls[0]?.[0];
    expect(fallbackBody).not.toHaveProperty("instance");
    expect(fallbackBody).toMatchObject({
      status: 500,
      title: "Internal Server Error",
    });
  });

  it("includes code and instance in the 500 error log descriptor", () => {
    const errorSpy = vi
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
    const json = vi.fn();
    const type = vi.fn(() => ({ json }));
    const status = vi.fn(() => ({ type }));
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ url: "/boom" }),
        getResponse: () => ({ status }),
      }),
    };
    const exception = new BaseException({
      code: "engine-failure",
      instance: "urn:instance:req-42",
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      title: "Internal Server Error",
    });

    new ExceptionsFilter().catch(exception, host as never);

    expect(status).toHaveBeenCalledWith(500);
    const descriptor: unknown = errorSpy.mock.calls[0]?.[0];
    expect(descriptor).toContain("code=engine-failure");
    expect(descriptor).toContain("instance=urn:instance:req-42");

    errorSpy.mockRestore();
  });

  it("logs non-Error 500 rejections without a stack trace", () => {
    const errorSpy = vi
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
    const json = vi.fn();
    const type = vi.fn(() => ({ json }));
    const status = vi.fn(() => ({ type }));
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ url: "/boom" }),
        getResponse: () => ({ status }),
      }),
    };

    new ExceptionsFilter().catch("string rejection", host as never);

    expect(status).toHaveBeenCalledWith(500);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("500"),
      undefined,
    );
    const body: unknown = json.mock.calls[0]?.[0];
    expect(body).toMatchObject({
      code: "internal-server-error",
      status: 500,
      title: "Internal Server Error",
    });

    errorSpy.mockRestore();
  });

  it("keeps machine fields stable and separates localized detail", () => {
    expect(
      mapResultToResponse(
        err(
          new BaseException({
            code: "not-found",
            status: HttpStatus.NOT_FOUND,
            title: "Not Found",
          }),
        ),
        "en",
      ),
    ).toMatchObject({
      code: "not-found",
      detail: "The requested resource was not found.",
      status: 404,
      title: "Not Found",
      type: "urn:problem:nest-react-boilerplate:not-found",
    });
    expect(
      mapResultToResponse(
        err(
          new BaseException({
            code: "not-found",
            status: HttpStatus.NOT_FOUND,
            title: "Not Found",
          }),
        ),
        "ru",
      ),
    ).toMatchObject({
      code: "not-found",
      detail: "The requested resource was not found.",
      localizedDetail: "Запрашиваемый ресурс не найден.",
      status: 404,
      title: "Not Found",
      type: "urn:problem:nest-react-boilerplate:not-found",
    });
  });
});
