import { IsString } from 'class-validator';

export class CreateNotificationResponseDto {
  @IsString()
  id!: string;

  @IsString()
  templateCode!: string;
}
