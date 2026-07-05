import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsString } from "class-validator";
import {
  adminAssignablePermissions,
  adminAssignableRoles,
} from "@app/backend-feature-admin-shared";

export class UpdateAdminUserAccessPolicyDto {
  @ApiProperty({ enum: adminAssignableRoles, isArray: true })
  @IsArray()
  @IsString({ each: true })
  roles!: string[];

  @ApiProperty({ enum: adminAssignablePermissions, isArray: true })
  @IsArray()
  @IsString({ each: true })
  permissions!: string[];
}
