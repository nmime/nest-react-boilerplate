// @requirements REQ-PAYMENT-ORDER-003 REQ-PAYMENT-PROVIDER-005
import { PaymentsPersistence } from '@app/backend-feature-payments-shared';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { PaymentsPostgresModule, PaymentsPostgresEntitySchemas } from './payments-postgres.module';
import { PaymentsPostgresPersistence } from './infrastructure/data-access/repositories';

const metadata = <T>(key: string): T[] => (Reflect.getMetadata(key, PaymentsPostgresModule) as T[] | undefined) ?? [];

describe('PaymentsPostgresModule', () => {
  it('registers every entity schema from the design file map', () => {
    expect(PaymentsPostgresEntitySchemas).toHaveLength(6);
    expect(PaymentsPostgresEntitySchemas.map((schema) => schema.meta.tableName)).toEqual([
      'payment_providers',
      'payments',
      'payment_events',
      'payment_webhook_receipts',
      'payment_refunds',
      'payment_provider_health',
    ]);
  });

  it('binds and exports PaymentsPersistence with useExisting', () => {
    expect(metadata<{ provide?: unknown; useExisting?: unknown }>(MODULE_METADATA.PROVIDERS)).toContainEqual({
      provide: PaymentsPersistence,
      useExisting: PaymentsPostgresPersistence,
    });
    expect(metadata<unknown>(MODULE_METADATA.EXPORTS)).toEqual(
      expect.arrayContaining([PaymentsPersistence, PaymentsPostgresPersistence]),
    );
  });
});
