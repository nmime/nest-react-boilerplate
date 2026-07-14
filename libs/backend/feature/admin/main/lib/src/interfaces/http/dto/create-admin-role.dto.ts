import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { adminAssignablePermissions } from '@app/backend-feature-admin-shared';

export class CreateAdminRoleDto {
  @ApiProperty({ maxLength: 64, minLength: 1 })
  @IsString()
  @Length(1, 64)
  key!: string;

  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  label?: string;

  @ApiPropertyOptional({ maxLength: 512 })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  @ApiPropertyOptional({ enum: adminAssignablePermissions, isArray: true })
  @IsOptional()
  @IsArray()
  @IsIn(adminAssignablePermissions, { each: true })
  permissions?: string[];
}
