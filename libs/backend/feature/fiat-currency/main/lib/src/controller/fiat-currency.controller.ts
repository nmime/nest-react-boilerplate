import type { FiatCurrencyRate, LocalizedFiatCurrency } from '@app/backend-feature-fiat-currency-shared';
import { type LocaleRequestSource, resolveLocaleFromRequest } from '@app/backend-common-i18n';
import { createOkResponse, type OkResponse } from '@app/backend-common-response';
import { ApiExceptions, ApiOkDataResponse } from '@app/backend-common-swagger';
import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { ApiParam } from '@nestjs/swagger';
import { FiatCurrencyService } from '../service';
import {
  FiatCurrencyListPayloadDto,
  FiatCurrencyRateListPayloadDto,
  type FiatCurrencyRateViewDto,
  type FiatCurrencyViewDto,
  ListFiatCurrenciesQueryDto,
  ListFiatRatesQueryDto,
} from './dto';

function toCurrencyView(currency: LocalizedFiatCurrency): FiatCurrencyViewDto {
  return {
    code: currency.code,
    name: currency.name,
    symbol: currency.symbol,
    imageUrl: currency.imageUrl,
    minorUnitExponent: currency.minorUnitExponent,
    usdPerUnit: currency.usdPerUnit,
    // ISO text rather than a Date so the wire shape does not depend on the serializer in use.
    rateAsOf: currency.rateAsOf?.toISOString() ?? null,
  };
}

function toRateView(rate: FiatCurrencyRate): FiatCurrencyRateViewDto {
  return { code: rate.code, usdPerUnit: rate.usdPerUnit, asOf: rate.asOf.toISOString(), source: rate.source };
}

/**
 * The catalogue as clients read it.
 *
 * Read-only on purpose. Rates arrive from providers through {@link FiatRateRefreshService} and the
 * catalogue itself is operator data, so exposing writes here would mean minting an admin surface
 * without the RBAC that every other admin surface in this workspace goes through.
 */
@ApiExceptions(400, 429, 500)
@Controller('api/v1/fiat-currencies')
export class FiatCurrencyController {
  constructor(private readonly currencies: FiatCurrencyService) {}

  @Get()
  @ApiOkDataResponse(FiatCurrencyListPayloadDto)
  async list(
    @Query() query: ListFiatCurrenciesQueryDto,
    @Req() request: LocaleRequestSource,
  ): Promise<OkResponse<{ items: FiatCurrencyViewDto[] }>> {
    const locale = query.locale ?? resolveLocaleFromRequest(request);
    const currencies = await this.currencies.listCurrencies(locale, {
      includeInactive: query.includeInactive === true,
    });

    return createOkResponse({ items: currencies.map(toCurrencyView) });
  }

  @Get(':code/rates')
  @ApiParam({ name: 'code', schema: { pattern: '^[A-Z]{3}$', type: 'string' } })
  @ApiOkDataResponse(FiatCurrencyRateListPayloadDto)
  async listRates(
    @Param('code') code: string,
    @Query() query: ListFiatRatesQueryDto,
  ): Promise<OkResponse<{ items: FiatCurrencyRateViewDto[] }>> {
    const rates = await this.currencies.listRateHistory({
      code,
      since: query.since ? new Date(query.since) : undefined,
      until: query.until ? new Date(query.until) : undefined,
      limit: query.limit,
    });

    return createOkResponse({ items: rates.map(toRateView) });
  }
}
