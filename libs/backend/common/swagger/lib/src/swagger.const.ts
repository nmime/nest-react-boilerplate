import type { Type } from '@nestjs/common';
import { getSchemaPath } from '@nestjs/swagger';

export const sessionCookieSecuritySchemes = [
  {
    name: 'nrb.sid',
    description: 'Development/default HTTP session cookie. SESSION_COOKIE_NAME may override the runtime name.',
  },
  {
    name: '__Host-nrb.sid',
    description: 'Production default HTTPS session cookie. SESSION_COOKIE_NAME may override the runtime name.',
  },
] as const;

export const sessionCookieSecuritySchemeNames = sessionCookieSecuritySchemes.map(({ name }) => name);

export const okResponseOpenApiSchema = (model: Type<unknown>) => ({
  type: 'object',
  required: ['data'],
  properties: {
    data: { $ref: getSchemaPath(model) },
  },
});
