import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDefined, IsOptional, IsString, MaxLength } from 'class-validator';

export class AdminFeatureFlagViewDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  key!: string;

  @ApiProperty({ oneOf: [{ type: 'boolean' }, { type: 'number' }, { type: 'string' }] })
  value!: boolean | number | string;

  @ApiProperty()
  description!: string;

  @ApiProperty()
  enabled!: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class AdminFeatureFlagListPayloadDto {
  @ApiProperty({ isArray: true, type: AdminFeatureFlagViewDto })
  items!: AdminFeatureFlagViewDto[];
}

export class UpsertAdminFeatureFlagDto {
  @ApiProperty({ oneOf: [{ type: 'boolean' }, { type: 'number' }, { type: 'string' }] })
  @IsDefined()
  value!: unknown;

  @ApiPropertyOptional({ maxLength: 1_000 })
  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
