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
});
