import { ApiProperty } from "@nestjs/swagger";
import { IsIn } from "class-validator";
import { adminUserStatuses, type AdminUserStatus } from "../../../domain";

export class UpdateAdminUserStatusDto {
  @ApiProperty({ enum: adminUserStatuses })
  @IsIn(adminUserStatuses)
  status!: AdminUserStatus;
}
