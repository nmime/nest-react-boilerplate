import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Middleware } from "openapi-fetch";

const { createClientMock, createQueryClientMock, useSpy, fakeClient } =
  vi.hoisted(() => {
    const useSpy = vi.fn();
    const fakeClient = { __brand: "openapi-client", use: useSpy };
    return {
      createClientMock: vi.fn(() => fakeClient),
      createQueryClientMock: vi.fn((client: unknown) => ({ __query: client })),
      useSpy,
      fakeClient,
    };
  });

vi.mock("openapi-fetch", () => ({ default: createClientMock }));
vi.mock("openapi-react-query", () => ({ default: createQueryClientMock }));

// Imported after the mocks are declared so the factory sees the stubbed deps.
const { createTypedOpenApiRuntime } = await import("./openapi-runtime");

describe("createTypedOpenApiRuntime", () => {
  beforeEach(() => {
    createClientMock.mockClear();
    createQueryClientMock.mockClear();
    useSpy.mockClear();
  });

  it("forwards client options and registers every middleware in order", () => {
    const first: Middleware = { onRequest: vi.fn() };
    const second: Middleware = { onResponse: vi.fn() };

    const runtime = createTypedOpenApiRuntime<Record<string, never>>({
      baseUrl: "https://api.example.test",
      middlewares: [first, second],
    });

    expect(createClientMock).toHaveBeenCalledWith({
      baseUrl: "https://api.example.test",
    });
    expect(useSpy).toHaveBeenCalledTimes(2);
    expect(useSpy).toHaveBeenNthCalledWith(1, first);
    expect(useSpy).toHaveBeenNthCalledWith(2, second);
    expect(runtime.client).toBe(fakeClient);
    expect(createQueryClientMock).toHaveBeenCalledWith(fakeClient);
    expect(runtime.query).toEqual({ __query: fakeClient });
  });

  it("defaults to no options and an empty middleware list", () => {
    const runtime = createTypedOpenApiRuntime();

    expect(createClientMock).toHaveBeenCalledWith({});
    expect(useSpy).not.toHaveBeenCalled();
    expect(runtime.client).toBe(fakeClient);
    expect(runtime.query).toEqual({ __query: fakeClient });
  });
});
