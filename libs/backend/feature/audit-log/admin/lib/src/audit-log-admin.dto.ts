import { Type } from 'class-transformer';
import { IsISO8601, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AdminAuditActions } from '@app/backend-feature-auth-shared';
import { AdminAuditResources, AuditLogAdminMaxPageSize } from './audit-log-admin.const';

export class AuditLogAdminListQueryDto {
  @ApiPropertyOptional({ maximum: AuditLogAdminMaxPageSize, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(AuditLogAdminMaxPageSize)
  limit?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @ApiPropertyOptional({ enum: AdminAuditActions })
  @IsOptional()
  @IsIn(AdminAuditActions)
  action?: (typeof AdminAuditActions)[number];

  @ApiPropertyOptional({ enum: AdminAuditResources })
  @IsOptional()
  @IsIn(AdminAuditResources)
  resource?: (typeof AdminAuditResources)[number];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  actorUserId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  targetId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  createdFrom?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  createdTo?: string;
}

export class AuditLogAdminViewDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  actorUserId?: string;

  @ApiProperty()
  action!: string;

  @ApiProperty()
  resource!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  targetId?: string;

  @ApiProperty({ additionalProperties: true, type: 'object' })
  before!: Record<string, unknown>;

  @ApiProperty({ additionalProperties: true, type: 'object' })
  after!: Record<string, unknown>;

  @ApiProperty({ additionalProperties: true, type: 'object' })
  metadata!: Record<string, unknown>;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class AuditLogAdminListPayloadDto {
  @ApiProperty({ isArray: true, type: () => AuditLogAdminViewDto })
  items!: AuditLogAdminViewDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  offset!: number;
}

export class AuditLogAdminMetadataDto {
  @ApiProperty({ isArray: true, type: String })
  actions!: string[];

  @ApiProperty({ isArray: true, type: String })
  resources!: string[];
}

export class AuditLogAdminIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  @IsString()
  @MaxLength(36)
  id!: string;
}
