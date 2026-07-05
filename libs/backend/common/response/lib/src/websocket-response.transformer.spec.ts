import { HttpException, HttpStatus, NotFoundException } from "@nestjs/common";
import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { lastValueFrom, of, throwError } from "rxjs";
import { describe, expect, it } from "vitest";
import { BaseException } from "@app/backend-common-exception";
import { WebSocketResponseTransformer } from "./websocket-response.transformer";

const contextWithData = (data: unknown): ExecutionContext =>
  ({
    switchToWs: () => ({ getData: () => data }),
  }) as unknown as ExecutionContext;

const handlerOf = (value: unknown): CallHandler => ({
  handle: () => of(value),
});

const intercept = (context: ExecutionContext, next: CallHandler) =>
  lastValueFrom(new WebSocketResponseTransformer().intercept(context, next));

describe("WebSocketResponseTransformer", () => {
  it("wraps object results with the request id and a success flag", async () => {
    const response = await intercept(
      contextWithData({ id: "req-1" }),
      handlerOf({ balance: 100 }),
    );

    expect(response).toEqual({
      id: "req-1",
      result: { balance: 100, success: true },
    });
  });

  it("wraps primitive results under a value key", async () => {
    const response = await intercept(
      contextWithData({ id: "req-2" }),
      handlerOf("pong"),
    );

    expect(response.result).toEqual({ value: "pong", success: true });
  });

  it("maps domain exceptions to their problem code", async () => {
    const response = await intercept(contextWithData({ id: "req-3" }), {
      handle: () =>
        throwError(
          () =>
            new BaseException({
              code: "insufficient-funds",
              detail: "Not enough balance",
              status: HttpStatus.CONFLICT,
              title: "Conflict",
            }),
        ),
    });

    expect(response.id).toBe("req-3");
    expect(response.error).toMatchObject({
      code: "insufficient-funds",
      message: "Not enough balance",
    });
    expect(response.error?.data).toMatchObject({ status: 409 });
  });

  it("maps built-in HttpExceptions through their resolved problem code", async () => {
    const response = await intercept(contextWithData({ id: "req-http" }), {
      handle: () => throwError(() => new NotFoundException("Missing user")),
    });

    expect(response.id).toBe("req-http");
    expect(response.error).toMatchObject({
      code: "not-found",
      message: "The requested resource was not found.",
    });
    expect(response.error?.data).toMatchObject({ status: 404 });
  });

  it("falls back to the problem title when an HttpException carries no detail", async () => {
    const response = await intercept(contextWithData({ id: "req-title" }), {
      handle: () =>
        throwError(() => new HttpException("", HttpStatus.BAD_GATEWAY)),
    });

    expect(response.error?.code).toBe("bad-gateway");
    expect(response.error?.message).toBe("Bad Gateway");
  });

  it("reports unknown rejections as internal errors", async () => {
    const response = await intercept(contextWithData({ id: "req-4" }), {
      handle: () => throwError(() => new Error("boom")),
    });

    expect(response.error?.code).toBe("internal-error");
    expect(response.error?.message).toBeDefined();
  });

  it("returns a null id when the payload lacks a usable id", async () => {
    const missing = await intercept(
      contextWithData({ method: "ping" }),
      handlerOf({ ok: true }),
    );
    const notObject = await intercept(
      contextWithData("raw"),
      handlerOf({ ok: true }),
    );
    const numericId = await intercept(
      contextWithData({ id: 7 }),
      handlerOf({ ok: true }),
    );

    expect(missing.id).toBeNull();
    expect(notObject.id).toBeNull();
    expect(numericId.id).toBeNull();
  });
});
