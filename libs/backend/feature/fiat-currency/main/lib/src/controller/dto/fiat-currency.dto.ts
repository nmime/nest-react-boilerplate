import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsISO8601, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class FiatCurrencyViewDto {
  @ApiProperty({ example: 'EUR' })
  code!: string;

  /** Already resolved for the caller's locale; falls back to the code when nobody named it. */
  @ApiProperty({ example: 'Euro' })
  name!: string;

  @ApiProperty({ example: '€' })
  symbol!: string;

  @ApiProperty({ nullable: true, type: String })
  imageUrl!: string | null;

  @ApiProperty({ example: 2 })
  minorUnitExponent!: number;

  @ApiProperty({ nullable: true, type: String, description: 'USD per major unit, as decimal text.' })
  usdPerUnit!: string | null;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  rateAsOf!: string | null;
}

export class FiatCurrencyListPayloadDto {
  @ApiProperty({ isArray: true, type: FiatCurrencyViewDto })
  items!: FiatCurrencyViewDto[];
}

export class FiatCurrencyRateViewDto {
  @ApiProperty({ example: 'EUR' })
  code!: string;

  @ApiProperty({ example: '1.08' })
  usdPerUnit!: string;

  @ApiProperty({ format: 'date-time' })
  asOf!: string;

  @ApiProperty({ example: 'ecb', description: 'Rate provider id, or "manual" when typed in.' })
  source!: string;
}

export class FiatCurrencyRateListPayloadDto {
  @ApiProperty({ isArray: true, type: FiatCurrencyRateViewDto })
  items!: FiatCurrencyRateViewDto[];
}

export class ListFiatCurrenciesQueryDto {
  @ApiPropertyOptional({ description: 'Overrides the locale negotiated from the request headers.' })
  @IsOptional()
  @IsString()
  @MaxLength(35)
  locale?: string;

  @ApiPropertyOptional({ description: 'Includes currencies an operator has retired.' })
  @IsOptional()
  // Not `@Type(() => Boolean)`: a query string carries text, and `Boolean('false')` is true.
  @Transform(({ value }) => (value === undefined ? undefined : value === true || value === 'true' || value === '1'))
  @IsBoolean()
  includeInactive?: boolean;
}

export class ListFiatRatesQueryDto {
  @ApiPropertyOptional({ format: 'date-time', description: 'Inclusive lower bound on the quote instant.' })
  @IsOptional()
  @IsISO8601()
  since?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'Exclusive upper bound on the quote instant.' })
  @IsOptional()
  @IsISO8601()
  until?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 1_000, default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000)
  limit?: number;
}
