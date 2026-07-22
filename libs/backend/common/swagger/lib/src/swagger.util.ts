import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { sessionCookieSecuritySchemes } from './swagger.const';

export type SwaggerAuthScheme = 'session-cookie';

export interface SetupSwaggerOptions {
  authSchemes?: readonly SwaggerAuthScheme[];
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

  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export function resolveSwaggerOptions(
  options: SetupSwaggerOptions,
  env: Record<string, string | undefined> = process.env,
): Required<Pick<SetupSwaggerOptions, 'enabled' | 'path' | 'title' | 'version'>> &
  Pick<SetupSwaggerOptions, 'description'> & { authSchemes: readonly SwaggerAuthScheme[] } {
  const requestedEnabled = options.enabled ?? readBoolean(env.OPENAPI_ENABLED) ?? false;
  const enabled =
    env.NODE_ENV === 'production'
      ? requestedEnabled && (readBoolean(env.OPENAPI_ALLOW_PRODUCTION) ?? false)
      : requestedEnabled;

  return {
    authSchemes: options.authSchemes ?? ['session-cookie'],
    enabled,
    path: options.path ?? env.OPENAPI_PATH ?? 'docs',
    title: env.OPENAPI_TITLE ?? options.title,
    version: options.version ?? env.OPENAPI_VERSION ?? '1.0.0',
    ...((options.description ?? env.OPENAPI_DESCRIPTION)
      ? { description: options.description ?? env.OPENAPI_DESCRIPTION }
      : {}),
  };
}

export function setupSwagger(app: INestApplication, options: SetupSwaggerOptions): void {
  const resolved = resolveSwaggerOptions(options);
  if (!resolved.enabled) {
    return;
  }

  const builder = new DocumentBuilder().setTitle(resolved.title).setVersion(resolved.version);

  if (resolved.authSchemes.includes('session-cookie')) {
    for (const { description, name } of sessionCookieSecuritySchemes) {
      builder.addCookieAuth(name, { description, type: 'apiKey' }, name);
    }
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
