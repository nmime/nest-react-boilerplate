import { Migration20260823100000InitializePayments } from './Migration20260823100000InitializePayments';

export * from './Migration20260823100000InitializePayments';

export const paymentsMongoMigrations = [Migration20260823100000InitializePayments] as const;
