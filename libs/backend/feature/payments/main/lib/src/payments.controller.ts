import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import { ApiOkDataResponse, ApiExceptions, ApiSessionCookieAuth } from '@app/backend-common-swagger';
import { createOkResponse, type OkResponse } from '@app/backend-common-response';
import { RbacGuard, SessionAuthGuard, RequirePermissions } from '@app/backend-feature-auth-shared';
import {
  PaymentsReadPermission,
  PaymentsWritePermission,
  type CreatePaymentsDto,
  type PaymentsDto,
} from '@app/backend-feature-payments-shared';
import { PaymentsService } from './payments.service';

class CreatePaymentsBodyDto implements CreatePaymentsDto {
  @ApiProperty({ minLength: 1, maxLength: 255 })
  @IsString()
  @Length(1, 255)
  name!: string;
}

class PaymentsResponseDto implements PaymentsDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

@ApiExceptions(400, 401, 403, 429, 500)
@ApiSessionCookieAuth()
@Controller('payments')
@UseGuards(new SessionAuthGuard(), new RbacGuard())
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  @RequirePermissions(PaymentsReadPermission)
  @ApiOkDataResponse(PaymentsResponseDto)
  async list(): Promise<OkResponse<PaymentsDto[]>> {
    return createOkResponse(await this.paymentsService.list());
  }

  @Post()
  @RequirePermissions(PaymentsWritePermission)
  @ApiOkDataResponse(PaymentsResponseDto)
  async create(@Body() input: CreatePaymentsBodyDto): Promise<OkResponse<PaymentsDto>> {
    return createOkResponse(await this.paymentsService.create(input));
  }
}
