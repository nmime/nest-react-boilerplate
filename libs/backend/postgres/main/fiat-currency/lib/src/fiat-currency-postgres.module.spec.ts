// @requirements REQ-FIAT-HISTORY-003
import { FiatCurrencyPersistence } from '@app/backend-feature-fiat-currency-shared';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { FiatCurrencyPostgresModule } from './fiat-currency-postgres.module';
import { FiatCurrencyPostgresPersistence } from './infrastructure/data-access/repositories';

const metadata = <T>(key: string): T[] =>
  (Reflect.getMetadata(key, FiatCurrencyPostgresModule) as T[] | undefined) ?? [];

describe('FiatCurrencyPostgresModule', () => {
  it('binds the persistence port to the Postgres implementation', () => {
    expect(metadata<{ provide?: unknown; useExisting?: unknown }>(MODULE_METADATA.PROVIDERS)).toContainEqual({
      provide: FiatCurrencyPersistence,
      useExisting: FiatCurrencyPostgresPersistence,
    });
  });

  it('exports the port so a feature module depends on the boundary, not the driver', () => {
    expect(metadata<unknown>(MODULE_METADATA.EXPORTS)).toContain(FiatCurrencyPersistence);
  });
});
