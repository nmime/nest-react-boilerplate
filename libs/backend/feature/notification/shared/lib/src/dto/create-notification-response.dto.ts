import { IsArray, IsString } from 'class-validator';

export class CreateNotificationResponseDto {
  @IsString()
  id!: string;

  @IsString()
  templateCode!: string;
}

export class CreateNotificationBatchResponseDto {
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}
