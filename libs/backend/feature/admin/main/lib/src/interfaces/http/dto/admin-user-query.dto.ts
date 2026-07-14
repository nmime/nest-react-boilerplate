import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { adminAssignablePermissions, adminAssignableRoles } from '@app/backend-feature-admin-shared';
import { AdminMaxPageSize, adminUserStatuses, type AdminUserStatus } from '../../../domain';

export class AdminUserQueryDto {
  @ApiPropertyOptional({ maximum: AdminMaxPageSize, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(AdminMaxPageSize)
  limit?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @ApiPropertyOptional({
    description: 'Case-insensitive email/display name search.',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: adminUserStatuses })
  @IsOptional()
  @IsIn(adminUserStatuses)
  status?: AdminUserStatus;

  @ApiPropertyOptional({ enum: adminAssignableRoles })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({ enum: adminAssignablePermissions })
  @IsOptional()
  @IsString()
  permission?: string;
}
