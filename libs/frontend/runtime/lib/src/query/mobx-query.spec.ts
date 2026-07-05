import { when } from "mobx";
import { describe, expect, it } from "vitest";

import { createMobxMutation, createMobxQuery } from "./mobx-query";
import { createFrontendQueryClient } from "./query-provider";

describe("mobx query integration", () => {
  it("exposes query results as MobX observables", async () => {
    const queryClient = createFrontendQueryClient();
    const query = createMobxQuery({
      queryClient,
      queryFn: () => Promise.resolve("payload"),
      queryKey: ["mobx-query", "demo"],
    });

    await when(() => query.isSuccess);

    expect(query.data).toBe("payload");
    query.destroy();
  });

  it("shares the query cache with the owning query client", async () => {
    const queryClient = createFrontendQueryClient();
    const query = createMobxQuery({
      queryClient,
      queryFn: () => Promise.resolve(42),
      queryKey: ["mobx-query", "cached"],
    });

    await when(() => query.isSuccess);

    expect(queryClient.getQueryData(["mobx-query", "cached"])).toBe(42);
    query.destroy();
  });

  it("surfaces query errors as observable state", async () => {
    const queryClient = createFrontendQueryClient();
    const query = createMobxQuery({
      queryClient,
      queryFn: () => Promise.reject(new Error("boom")),
      queryKey: ["mobx-query", "error"],
      retry: false,
    });

    await when(() => query.isError);

    expect(query.error).toBeInstanceOf(Error);
    expect((query.error as Error).message).toBe("boom");
    query.destroy();
  });

  it("refetches after the shared cache is invalidated", async () => {
    const queryClient = createFrontendQueryClient();
    let calls = 0;
    const query = createMobxQuery({
      queryClient,
      queryFn: () => {
        calls += 1;
        return Promise.resolve(calls);
      },
      queryKey: ["mobx-query", "invalidate"],
      staleTime: 0,
    });

    await when(() => query.data === 1);
    await queryClient.invalidateQueries({
      queryKey: ["mobx-query", "invalidate"],
    });
    await when(() => query.data === 2);

    expect(calls).toBe(2);
    query.destroy();
  });

  it("runs mutations with MobX-observable state", async () => {
    const queryClient = createFrontendQueryClient();
    const mutation = createMobxMutation({
      mutationFn: (value: number) => Promise.resolve(value * 2),
      queryClient,
    });

    await mutation.mutate(21);
    await when(() => mutation.isSuccess);

    expect(mutation.data).toBe(42);
    mutation.destroy();
  });

  it("surfaces mutation errors as observable state", async () => {
    const queryClient = createFrontendQueryClient();
    const mutation = createMobxMutation({
      mutationFn: () => Promise.reject(new Error("mutation failed")),
      queryClient,
    });

    await expect(mutation.mutate()).rejects.toThrow("mutation failed");
    await when(() => mutation.isError);

    expect(mutation.error).toBeInstanceOf(Error);
    expect((mutation.error as Error).message).toBe("mutation failed");
    mutation.destroy();
  });

  it("invalidates queries from a successful mutation and refetches", async () => {
    const queryClient = createFrontendQueryClient();
    let calls = 0;
    const query = createMobxQuery({
      queryClient,
      queryFn: () => {
        calls += 1;
        return Promise.resolve(calls);
      },
      queryKey: ["mobx-query", "mutation-invalidate"],
    });

    await when(() => query.data === 1);

    const mutation = createMobxMutation({
      mutationFn: () => Promise.resolve("ok"),
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: ["mobx-query", "mutation-invalidate"],
        }),
      queryClient,
    });

    await mutation.mutate();
    await when(() => query.data === 2);

    expect(query.data).toBe(2);
    mutation.destroy();
    query.destroy();
  });
});
