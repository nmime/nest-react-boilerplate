import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, Matches, MaxLength } from 'class-validator';
import { adminAssignablePermissions } from '@app/backend-feature-admin-shared';

const AuditReasonMaxLength = 500;

export class UpdateAdminUserAccessPolicyDto {
  @ApiProperty({ type: String, isArray: true })
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
