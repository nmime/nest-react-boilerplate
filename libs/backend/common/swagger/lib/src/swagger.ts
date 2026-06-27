import { HttpStatus, applyDecorators } from "@nestjs/common";
import type { INestApplication, Type } from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiExtraModels,
  ApiOkResponse,
  DocumentBuilder,
  getSchemaPath,
  SwaggerModule,
} from "@nestjs/swagger";
import { ApiExceptions } from "@app/backend/common/exception";

export * from "@app/backend/common/exception";

export const sessionCookieSecuritySchemes = [
  {
    name: "nrb.sid",
    description:
      "Development/default HTTP session cookie. SESSION_COOKIE_NAME may override the runtime name.",
  },
  {
    name: "__Host-nrb.sid",
    description:
      "Production default HTTPS session cookie. SESSION_COOKIE_NAME may override the runtime name.",
  },
] as const;

export const sessionCookieSecuritySchemeNames =
  sessionCookieSecuritySchemes.map(({ name }) => name);

export function ApiSessionCookieAuth(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ...sessionCookieSecuritySchemes.map(({ name }) => ApiCookieAuth(name)),
  );
}

export const okResponseOpenApiSchema = (model: Type<unknown>) => ({
  type: "object",
  required: ["data"],
  properties: {
    data: { $ref: getSchemaPath(model) },
  },
});

export function ApiOkDataResponse(
  model: Type<unknown>,
): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiExtraModels(model),
    ApiOkResponse({
      description: "OK",
      schema: okResponseOpenApiSchema(model),
    }),
  );
}

export function ApiReadinessResponses(
  description: string,
): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiOkResponse({ description }),
    ApiExceptions(HttpStatus.SERVICE_UNAVAILABLE),
  );
}

export interface SetupSwaggerOptions {
  enabled?: boolean;
  path?: string;
  title: string;
  version?: string;
  description?: string;
}

export function readBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function resolveSwaggerOptions(
  options: SetupSwaggerOptions,
  env: Record<string, string | undefined> = process.env,
): Required<
  Pick<SetupSwaggerOptions, "enabled" | "path" | "title" | "version">
> &
  Pick<SetupSwaggerOptions, "description"> {
  const requestedEnabled =
    options.enabled ?? readBoolean(env.OPENAPI_ENABLED) ?? false;
  const enabled =
    env.NODE_ENV === "production"
      ? requestedEnabled && (readBoolean(env.OPENAPI_ALLOW_PRODUCTION) ?? false)
      : requestedEnabled;

  return {
    enabled,
    path: options.path ?? env.OPENAPI_PATH ?? "docs",
    title: env.OPENAPI_TITLE ?? options.title,
    version: options.version ?? env.OPENAPI_VERSION ?? "1.0.0",
    ...((options.description ?? env.OPENAPI_DESCRIPTION)
      ? { description: options.description ?? env.OPENAPI_DESCRIPTION }
      : {}),
  };
}

export function setupSwagger(
  app: INestApplication,
  options: SetupSwaggerOptions,
): void {
  const resolved = resolveSwaggerOptions(options);
  if (!resolved.enabled) {
    return;
  }

  const builder = new DocumentBuilder()
    .setTitle(resolved.title)
    .setVersion(resolved.version)
    .addBearerAuth();

  for (const { description, name } of sessionCookieSecuritySchemes) {
    builder.addCookieAuth(name, { description, type: "apiKey" }, name);
  }

  if (resolved.description) {
    builder.setDescription(resolved.description);
  }

  const config = builder.build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(resolved.path, app, document, {
    jsonDocumentUrl: `${resolved.path}/openapi.json`,
  });
}
