import { FiatCurrencyPersistence } from '@app/backend-feature-fiat-currency-shared';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import {
  FiatCurrencyEntitySchema,
  FiatCurrencyRateEntitySchema,
  FiatCurrencyTranslationEntitySchema,
} from './infrastructure/data-access/entities';
import { FiatCurrencyPostgresPersistence } from './infrastructure/data-access/repositories';

/**
 * Registers the fiat catalogue's tables and binds the persistence port.
 *
 * The feature module consumes {@link FiatCurrencyPersistence}, never this class, which is what
 * lets the same service run unchanged on the MongoDB axis.
 */
@Module({
  imports: [
    MikroOrmModule.forFeature([
      FiatCurrencyEntitySchema,
      FiatCurrencyTranslationEntitySchema,
      FiatCurrencyRateEntitySchema,
    ]),
  ],
  providers: [
    FiatCurrencyPostgresPersistence,
    { provide: FiatCurrencyPersistence, useExisting: FiatCurrencyPostgresPersistence },
  ],
  exports: [MikroOrmModule, FiatCurrencyPersistence, FiatCurrencyPostgresPersistence],
})
export class FiatCurrencyPostgresModule {}
