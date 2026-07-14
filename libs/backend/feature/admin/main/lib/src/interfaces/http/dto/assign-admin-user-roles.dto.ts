import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';
import { adminAssignableRoles } from '@app/backend-feature-admin-shared';

export class AssignAdminUserRolesDto {
  @ApiProperty({ enum: adminAssignableRoles, isArray: true })
  @IsArray()
  @IsString({ each: true })
  roles!: string[];
}
