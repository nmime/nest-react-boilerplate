import { ApiProperty } from "@nestjs/swagger";

export class AdminRbacRoleDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  role!: string;

  @ApiProperty()
  label!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty()
  isSystem!: boolean;

  @ApiProperty({ items: { type: "string" }, type: "array" })
  permissions!: string[];
}
