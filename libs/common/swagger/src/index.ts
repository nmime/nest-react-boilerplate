import { applyDecorators, HttpStatus } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { ApiResponse, DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

export const problemDetailsOpenApiSchema = {
  type: "object",
  required: ["type", "title", "status"],
  properties: {
    type: { type: "string", example: "about:blank" },
    title: { type: "string", example: "Bad Request" },
    status: { type: "integer", example: 400 },
    detail: { type: "string" },
    instance: { type: "string" },
    code: { type: "string" },
  },
};

const mapHttpStatusToProblemTitle = (status: number): string => {
  const title = (HttpStatus as unknown as Record<number, string>)[status];
  return typeof title === "string"
    ? title
        .toLowerCase()
        .split("_")
        .map((part: string) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ")
    : "Unexpected Error";
};

export function ApiProblemExceptions(
  ...statuses: number[]
): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({
        description: mapHttpStatusToProblemTitle(status),
        schema: problemDetailsOpenApiSchema,
        status,
      }),
    ),
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
  return {
    enabled: options.enabled ?? readBoolean(env.OPENAPI_ENABLED) ?? false,
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

  if (resolved.description) {
    builder.setDescription(resolved.description);
  }

  const config = builder.build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(resolved.path, app, document, {
    jsonDocumentUrl: `${resolved.path}/openapi.json`,
  });
}
