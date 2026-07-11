import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { adminUserStatuses, type AdminUserStatus } from '../../../domain';

export class AdminUserViewDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiPropertyOptional()
  displayName?: string;

  @ApiProperty({ enum: adminUserStatuses })
  status!: AdminUserStatus;

  @ApiProperty({ items: { type: 'string' }, type: 'array' })
  roles!: string[];

  @ApiProperty({ items: { type: 'string' }, type: 'array' })
  permissions!: string[];

  @ApiPropertyOptional()
  locale?: string;

  @ApiPropertyOptional({ enum: ['system', 'light', 'dark'] })
  theme?: string;

  @ApiPropertyOptional({ format: 'uri', maxLength: 2048 })
  avatarUrl?: string;

  @ApiPropertyOptional({
    enum: ['none', 'provider', 'manual', 'deleted'],
  })
  avatarStatus?: 'none' | 'provider' | 'manual' | 'deleted';

  @ApiPropertyOptional({ format: 'date-time' })
  lastLoginAt?: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}
