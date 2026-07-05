import { ApiProperty } from "@nestjs/swagger";
import { AdminUserViewDto } from "./admin-user-view.dto";

export class AdminUserListPayloadDto {
  @ApiProperty({ type: () => AdminUserViewDto, isArray: true })
  items!: AdminUserViewDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  offset!: number;
}
