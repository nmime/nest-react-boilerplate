import type { EntityManager } from "@mikro-orm/postgresql";
import { describe, expect, it } from "vitest";
import {
  runInPostgresTransaction,
  type TransactionCapable,
} from "./transaction";

describe("runInPostgresTransaction", () => {
  it("returns the handler value when the transaction commits", async () => {
    const entityManager = {} as EntityManager;
    const transactionalManager: TransactionCapable = {
      transactional: (handler) => Promise.resolve(handler(entityManager)),
    };

    const result = await runInPostgresTransaction(
      transactionalManager,
      (current) =>
        Promise.resolve({
          sameManager: current === entityManager,
        }),
    );

    expect(result._unsafeUnwrap()).toEqual({ sameManager: true });
  });

  it("maps thrown errors to explicit transaction errors", async () => {
    const transactionalManager: TransactionCapable = {
      transactional: () => Promise.reject(new Error("rollback")),
    };

    const result = await runInPostgresTransaction(transactionalManager, () =>
      Promise.resolve("unused"),
    );

    expect(result._unsafeUnwrapErr()).toEqual({
      code: "transaction_failed",
      message: "rollback",
    });
  });

  it("maps non-error failures to a stable message", async () => {
    const nonErrorReason = "rollback" as unknown as Error;
    const transactionalManager: TransactionCapable = {
      transactional: () => Promise.reject(nonErrorReason),
    };

    const result = await runInPostgresTransaction(transactionalManager, () =>
      Promise.resolve("unused"),
    );

    expect(result._unsafeUnwrapErr()).toEqual({
      code: "transaction_failed",
      message: "Postgres transaction failed.",
    });
  });
});
