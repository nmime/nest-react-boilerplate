import { HttpStatus, applyDecorators } from "@nestjs/common";
import type { INestApplication, Type } from "@nestjs/common";
import {
  ApiExtraModels,
  ApiOkResponse,
  DocumentBuilder,
  getSchemaPath,
  SwaggerModule,
} from "@nestjs/swagger";
import { ApiProblemExceptions } from "@app/common/exception";

export * from "@app/common/exception";

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
    ApiProblemExceptions(HttpStatus.SERVICE_UNAVAILABLE),
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
    .addBearerAuth()
    .addCookieAuth("nrb.sid");

  if (resolved.description) {
    builder.setDescription(resolved.description);
  }

  const config = builder.build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(resolved.path, app, document, {
    jsonDocumentUrl: `${resolved.path}/openapi.json`,
  });
}
