import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, Matches, MaxLength } from 'class-validator';
import { adminAssignablePermissions, adminAssignableRoles } from '@app/backend-feature-admin-shared';

const AuditReasonMaxLength = 500;

export class UpdateAdminUserAccessPolicyDto {
  @ApiProperty({ enum: adminAssignableRoles, isArray: true })
  @IsArray()
  @IsString({ each: true })
  roles!: string[];

  @ApiProperty({ enum: adminAssignablePermissions, isArray: true })
  @IsArray()
  @IsString({ each: true })
  permissions!: string[];

  @ApiProperty({ maxLength: AuditReasonMaxLength, minLength: 1 })
  @IsString()
  @Matches(/\S/u)
  @MaxLength(AuditReasonMaxLength)
  reason!: string;
}
