import { ClientSession } from 'mongodb';

export * from '@app/backend-mongodb-main';

/** The caller owns this active session; notification code must not commit it. */
export function notificationTransactionSession(transaction?: unknown): ClientSession | undefined {
  if (transaction === undefined) {
    return undefined;
  }
  if (!(transaction instanceof ClientSession) || transaction.hasEnded || !transaction.inTransaction()) {
    throw new Error('notification_invalid_transaction');
  }
  return transaction;
}
