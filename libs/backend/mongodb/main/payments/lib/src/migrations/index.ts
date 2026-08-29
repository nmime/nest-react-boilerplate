import { Migration20260823100000InitializePayments } from './Migration20260823100000InitializePayments';
import { Migration20260827100000AddPaymentWebhookClaimLease } from './Migration20260827100000AddPaymentWebhookClaimLease';

export * from './Migration20260823100000InitializePayments';
export * from './Migration20260827100000AddPaymentWebhookClaimLease';

export const paymentsMongoMigrations = [
  Migration20260823100000InitializePayments,
  Migration20260827100000AddPaymentWebhookClaimLease,
] as const;
