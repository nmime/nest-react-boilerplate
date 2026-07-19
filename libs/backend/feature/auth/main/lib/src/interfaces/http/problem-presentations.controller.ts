import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { createOkResponse, type OkResponse } from '@app/backend-common-response';
import { ApiOkDataResponse, ApiExceptions, ApiSessionCookieAuth } from '@app/backend-common-swagger';
import { CurrentUser, SessionAuthGuard, type AuthenticatedPrincipal } from '@app/backend-feature-auth-shared';
import {
  ProblemPresentationReaderProvider,
  type ProblemPresentationReader,
} from '../../application/problem-presentation-reader';
import { ProblemPresentationRuntimePayloadDto } from './problem-presentation-runtime.dto';

@ApiExceptions(401, 429, 500)
@ApiBearerAuth()
@ApiSessionCookieAuth()
@UseGuards(new SessionAuthGuard())
@Controller('auth/problem-presentations')
export class ProblemPresentationsController {
  constructor(
    @Inject(ProblemPresentationReaderProvider)
    private readonly presentations: ProblemPresentationReader,
  ) {}

  @Get()
  @ApiOkDataResponse(ProblemPresentationRuntimePayloadDto)
  async list(
    @CurrentUser() principal: AuthenticatedPrincipal,
  ): Promise<OkResponse<ProblemPresentationRuntimePayloadDto>> {
    return createOkResponse({ items: [...(await this.presentations.list(principal.tenantId))] });
  }
}
