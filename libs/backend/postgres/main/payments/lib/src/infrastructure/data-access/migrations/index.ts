import { Migration20260823100000CreatePayments } from './Migration20260823100000CreatePayments';

export const paymentsMigrations = [Migration20260823100000CreatePayments] as const;

export * from './Migration20260823100000CreatePayments';
