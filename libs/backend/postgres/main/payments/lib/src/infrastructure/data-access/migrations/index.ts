import { Migration20260823100000CreatePaymentProviders } from './Migration20260823100000CreatePaymentProviders';
import { Migration20260823100100CreatePayments } from './Migration20260823100100CreatePayments';
import { Migration20260823100200CreatePaymentEvents } from './Migration20260823100200CreatePaymentEvents';
import { Migration20260823100300CreatePaymentWebhookReceipts } from './Migration20260823100300CreatePaymentWebhookReceipts';

export const paymentsMigrations = [
  Migration20260823100000CreatePaymentProviders,
  Migration20260823100100CreatePayments,
  Migration20260823100200CreatePaymentEvents,
  Migration20260823100300CreatePaymentWebhookReceipts,
] as const;

export * from './Migration20260823100000CreatePaymentProviders';
export * from './Migration20260823100100CreatePayments';
export * from './Migration20260823100200CreatePaymentEvents';
export * from './Migration20260823100300CreatePaymentWebhookReceipts';
