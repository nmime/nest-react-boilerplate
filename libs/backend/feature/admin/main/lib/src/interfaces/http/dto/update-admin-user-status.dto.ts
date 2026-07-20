import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Matches, MaxLength } from 'class-validator';
import { adminUserStatuses, type AdminUserStatus } from '../../../domain';

const AuditReasonMaxLength = 500;

export class UpdateAdminUserStatusDto {
  @ApiProperty({ enum: adminUserStatuses })
  @IsIn(adminUserStatuses)
  status!: AdminUserStatus;

  @ApiProperty({ maxLength: AuditReasonMaxLength, minLength: 1 })
  @IsString()
  @Matches(/\S/u)
  @MaxLength(AuditReasonMaxLength)
  reason!: string;
}
