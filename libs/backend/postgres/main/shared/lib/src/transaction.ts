import type { EntityManager } from "@mikro-orm/postgresql";
import { ResultAsync } from "neverthrow";

export interface TransactionCapable {
  transactional<T>(
    handler: (manager: EntityManager) => Promise<T> | T,
  ): Promise<T>;
}

export interface PostgresTransactionError {
  code: "transaction_failed";
  message: string;
}

export function runInPostgresTransaction<T>(
  manager: TransactionCapable,
  handler: (manager: EntityManager) => Promise<T> | T,
): ResultAsync<T, PostgresTransactionError> {
  return ResultAsync.fromPromise(manager.transactional(handler), (cause) => ({
    code: "transaction_failed",
    message:
      cause instanceof Error ? cause.message : "Postgres transaction failed.",
  }));
}
