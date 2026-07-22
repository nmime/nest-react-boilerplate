import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';
export class AssignAdminUserRolesDto {
  @ApiProperty({ type: String, isArray: true })
  @IsArray()
  @IsString({ each: true })
  roles!: string[];
}
