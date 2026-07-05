import type { LoggerService } from "@nestjs/common";
import { vi } from "vitest";

export function createTestingLogger(): LoggerService {
  return {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
  };
}

export function createMock<T extends Record<string, unknown>>(
  overrides: Partial<T> = {},
): T {
  return overrides as T;
}

export function createRepositoryMock<T extends Record<string, unknown>>(): {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? ReturnType<typeof vi.fn<(...args: A) => R>>
    : T[K];
} {
  const mock = {};
  return mock as {
    [K in keyof T]: T[K] extends (...args: infer A) => infer R
      ? ReturnType<typeof vi.fn<(...args: A) => R>>
      : T[K];
  };
}

export function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}
