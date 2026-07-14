import { HttpStatus, applyDecorators } from '@nestjs/common';
import type { Type } from '@nestjs/common';
import { ApiCookieAuth, ApiExtraModels, ApiOkResponse } from '@nestjs/swagger';
import { ApiExceptions } from '@app/backend-common-exception';
import { okResponseOpenApiSchema, sessionCookieSecuritySchemes } from './swagger.const';

export function ApiSessionCookieAuth(): MethodDecorator & ClassDecorator {
  return applyDecorators(...sessionCookieSecuritySchemes.map(({ name }) => ApiCookieAuth(name)));
}

export function ApiOkDataResponse(model: Type<unknown>): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiExtraModels(model),
    ApiOkResponse({
      description: 'OK',
      schema: okResponseOpenApiSchema(model),
    }),
  );
}

export function ApiReadinessResponses(description: string): MethodDecorator & ClassDecorator {
  return applyDecorators(ApiOkResponse({ description }), ApiExceptions(HttpStatus.SERVICE_UNAVAILABLE));
}
