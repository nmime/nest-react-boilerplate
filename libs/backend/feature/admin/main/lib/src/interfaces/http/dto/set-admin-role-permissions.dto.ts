import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsIn } from 'class-validator';
import { adminAssignablePermissions } from '@app/backend-feature-admin-shared';

export class SetAdminRolePermissionsDto {
  @ApiProperty({ enum: adminAssignablePermissions, isArray: true })
  @IsArray()
  @IsIn(adminAssignablePermissions, { each: true })
  permissions!: string[];
}
