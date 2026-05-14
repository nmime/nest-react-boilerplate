import { ResultAsync } from "neverthrow";
import type { EntityManager } from "typeorm";

export interface TransactionCapable {
  transaction<T>(handler: (manager: EntityManager) => Promise<T>): Promise<T>;
}

export interface PostgresTransactionError {
  code: "transaction_failed";
  message: string;
}

export function runInPostgresTransaction<T>(
  dataSource: TransactionCapable,
  handler: (manager: EntityManager) => Promise<T>,
): ResultAsync<T, PostgresTransactionError> {
  return ResultAsync.fromPromise(dataSource.transaction(handler), (cause) => ({
    code: "transaction_failed",
    message:
      cause instanceof Error ? cause.message : "Postgres transaction failed.",
  }));
}
