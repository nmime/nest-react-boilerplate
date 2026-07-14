import { ApiProperty } from '@nestjs/swagger';

export class AdminRbacPermissionDto {
  @ApiProperty()
  permission!: string;

  @ApiProperty()
  resource!: string;

  @ApiProperty()
  action!: string;

  @ApiProperty()
  description!: string;
}
