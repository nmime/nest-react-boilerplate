import { describe, expect, it } from "vitest";
import type { EntityManager } from "typeorm";
import {
  runInPostgresTransaction,
  type TransactionCapable,
} from "./transaction";

describe("runInPostgresTransaction", () => {
  it("returns the handler value when the transaction commits", async () => {
    const manager = {} as EntityManager;
    const dataSource: TransactionCapable = {
      transaction: (handler) => handler(manager),
    };

    const result = await runInPostgresTransaction(dataSource, (current) =>
      Promise.resolve({
        sameManager: current === manager,
      }),
    );

    expect(result._unsafeUnwrap()).toEqual({ sameManager: true });
  });

  it("maps thrown errors to explicit transaction errors", async () => {
    const dataSource: TransactionCapable = {
      transaction: () => Promise.reject(new Error("rollback")),
    };

    const result = await runInPostgresTransaction(dataSource, () =>
      Promise.resolve("unused"),
    );

    expect(result._unsafeUnwrapErr()).toEqual({
      code: "transaction_failed",
      message: "rollback",
    });
  });

  it("maps non-error failures to a stable message", async () => {
    const dataSource: TransactionCapable = {
      transaction: () =>
        // eslint-disable-next-line sonarjs/prefer-promise-shorthand
        new Promise((_resolve, reject) => {
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          reject("rollback");
        }),
    };

    const result = await runInPostgresTransaction(dataSource, () =>
      Promise.resolve("unused"),
    );

    expect(result._unsafeUnwrapErr()).toEqual({
      code: "transaction_failed",
      message: "Postgres transaction failed.",
    });
  });
});
