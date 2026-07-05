import { HttpException, HttpStatus } from "@nestjs/common";
import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { lastValueFrom, throwError } from "rxjs";
import { describe, expect, it, vi } from "vitest";

// The real `toProblemDetails` always assigns a `code` (via localizeProblemDetails
// -> problemCodeForStatus), so the transformer's `problem.code ?? "request-failed"`
// safety net is only reachable when the descriptor is missing a code entirely.
// Mock the descriptor to force that defensive branch.
vi.mock("@app/backend-common-exception", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/backend-common-exception")>();
  return {
    ...actual,
    toProblemDetails: vi.fn(() => ({
      status: HttpStatus.BAD_GATEWAY,
      title: "Upstream unavailable",
      type: "about:blank",
    })),
  };
});

const { WebSocketResponseTransformer } =
  await import("./websocket-response.transformer");

const contextWithData = (data: unknown): ExecutionContext =>
  ({
    switchToWs: () => ({ getData: () => data }),
  }) as unknown as ExecutionContext;

describe("WebSocketResponseTransformer codeless-problem fallback", () => {
  it("uses request-failed and the title when the problem lacks a code and detail", async () => {
    const next: CallHandler = {
      handle: () =>
        throwError(() => new HttpException("boom", HttpStatus.BAD_GATEWAY)),
    };

    const response = await lastValueFrom(
      new WebSocketResponseTransformer().intercept(
        contextWithData({ id: "req-fallback" }),
        next,
      ),
    );

    expect(response.error).toEqual({
      code: "request-failed",
      message: "Upstream unavailable",
      data: {
        status: HttpStatus.BAD_GATEWAY,
        title: "Upstream unavailable",
        type: "about:blank",
      },
    });
  });
});
