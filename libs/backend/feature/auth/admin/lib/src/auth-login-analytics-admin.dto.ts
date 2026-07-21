import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from 'class-validator';

const uppercaseString = (value: unknown): unknown => (typeof value === 'string' ? value.toUpperCase() : value);

export class AuthLoginAnalyticsQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ enum: ['success', 'failure'] })
  @IsOptional()
  @IsIn(['success', 'failure'])
  outcome?: 'success' | 'failure';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  provider?: string;

  @ApiPropertyOptional({ minLength: 2, maxLength: 2 })
  @IsOptional()
  @Transform(({ value }) => uppercaseString(value as unknown))
  @IsString()
  @Length(2, 2)
  countryCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(35)
  language?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  occurredFrom?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  occurredTo?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class AuthLoginAnalyticsEventDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) tenantId!: string;
  @ApiPropertyOptional({ format: 'uuid' }) userId?: string;
  @ApiProperty({ enum: ['login', 'registration'] }) eventType!: 'login' | 'registration';
  @ApiProperty({ enum: ['success', 'failure'] }) outcome!: 'success' | 'failure';
  @ApiProperty() provider!: string;
  @ApiProperty() channel!: string;
  @ApiPropertyOptional() failureCode?: string;
  @ApiPropertyOptional() ipAddress?: string;
  @ApiPropertyOptional() countryCode?: string;
  @ApiPropertyOptional() region?: string;
  @ApiPropertyOptional() city?: string;
  @ApiPropertyOptional() timezone?: string;
  @ApiPropertyOptional() timezoneSource?: string;
  @ApiPropertyOptional() language?: string;
  @ApiPropertyOptional() languageSource?: string;
  @ApiPropertyOptional() userAgent?: string;
  @ApiPropertyOptional() requestId?: string;
  @ApiProperty() networkAnonymized!: boolean;
  @ApiProperty({ format: 'date-time' }) occurredAt!: string;
}

export class AuthLoginAnalyticsListPayloadDto {
  @ApiProperty({ type: () => [AuthLoginAnalyticsEventDto] }) items!: AuthLoginAnalyticsEventDto[];
  @ApiProperty() total!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() offset!: number;
}

export class AuthLoginAnalyticsDimensionDto {
  @ApiProperty() key!: string;
  @ApiProperty() count!: number;
}

export class AuthLoginAnalyticsSummaryDto {
  @ApiProperty() total!: number;
  @ApiProperty() successful!: number;
  @ApiProperty() failed!: number;
  @ApiProperty() uniqueUsers!: number;
  @ApiProperty() successRate!: number;
  @ApiProperty({ type: () => [AuthLoginAnalyticsDimensionDto] }) byCountry!: AuthLoginAnalyticsDimensionDto[];
  @ApiProperty({ type: () => [AuthLoginAnalyticsDimensionDto] }) byLanguage!: AuthLoginAnalyticsDimensionDto[];
  @ApiProperty({ type: () => [AuthLoginAnalyticsDimensionDto] }) byTimezone!: AuthLoginAnalyticsDimensionDto[];
  @ApiProperty({ type: () => [AuthLoginAnalyticsDimensionDto] }) byProvider!: AuthLoginAnalyticsDimensionDto[];
}
