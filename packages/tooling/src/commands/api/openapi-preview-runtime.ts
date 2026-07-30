import { type DynamicModule, type InjectionToken, type Provider, type Type } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const applicationModules = {
  "admin-app-api": ["apps/backend/admin/admin-app-api/src/admin-app-api.module.ts", "AdminAppApiModule"],
  "auth-app-api": ["apps/backend/auth/auth-app-api/src/auth-app-api.module.ts", "AuthAppApiModule"],
  "user-app-api": ["apps/backend/user/user-app-api/src/user-app-api.module.ts", "UserAppApiModule"],
} as const;

interface FeatureFlagsModule {
  FeatureFlagRepositoryToken: string;
}

interface SwaggerModule {
  createSwaggerDocument: (
    app: NestFastifyApplication,
    options: { authSchemes: readonly ["session-cookie"]; enabled: true; title: string },
  ) => { document: unknown } | undefined;
}

class OpenApiPreviewProvidersModule {}
class OpenApiPreviewRootModule {}
const load = createRequire(resolve(process.cwd(), "package.json"));

function readOption(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`${name} requires a value.`);
  return value;
}

function previewProviderTokens(): InjectionToken[] {
  const authShared = load(
    resolve(process.cwd(), "libs/backend/feature/auth/shared/lib/src/index.ts"),
  ) as Record<string, unknown>;
  const notificationShared = load(
    resolve(process.cwd(), "libs/backend/feature/notification/shared/lib/src/index.ts"),
  ) as Record<string, unknown>;
  const featureFlags = load(
    resolve(process.cwd(), "libs/common/feature-flags/lib/src/index.ts"),
  ) as FeatureFlagsModule;
  return [
    ...injectTokens(authShared),
    ...injectTokens(notificationShared),
    ...notificationPortTokens(notificationShared),
    featureFlags.FeatureFlagRepositoryToken,
  ];
}

function injectTokens(module: Record<string, unknown>): InjectionToken[] {
  return Object.entries(module).flatMap(([name, value]) =>
    name.endsWith("InjectToken") && (typeof value === "string" || typeof value === "symbol") ? [value] : [],
  );
}

function notificationPortTokens(module: Record<string, unknown>): InjectionToken[] {
  return Object.entries(module).flatMap(([name, value]) =>
    /^Notification.*(?:Maintenance|Persistence|Resolver)$/u.test(name) && typeof value === "function"
      ? [value as Type<unknown>]
      : [],
  );
}

function previewProvidersModule(tokens: InjectionToken[]): DynamicModule {
  const providers: Provider[] = tokens.map((token) => ({ provide: token, useValue: {} }));
  return {
    exports: tokens,
    global: true,
    module: OpenApiPreviewProvidersModule,
    providers,
  };
}

function loadApplicationModule(appName: keyof typeof applicationModules): Type<unknown> {
  const [modulePath, exportName] = applicationModules[appName];
  const loaded = load(resolve(process.cwd(), modulePath)) as Record<string, unknown>;
  const module = loaded[exportName];
  if (typeof module !== "function") {
    throw new Error(`${appName} does not export ${exportName}.`);
  }
  return module as Type<unknown>;
}

async function main(): Promise<void> {
  const appName = readOption("--app");
  const output = readOption("--output");
  if (!(appName in applicationModules)) {
    throw new Error(`OpenAPI preview is not configured for ${appName}.`);
  }
  process.env.AUTH_OAUTH_ENABLED = "false";
  process.env.AUTH_PERSISTENCE = "memory";
  process.env.DATABASE_URL = "";
  const applicationModule = loadApplicationModule(appName as keyof typeof applicationModules);
  const tokens = previewProviderTokens();
  const rootModule: DynamicModule = {
    imports: [previewProvidersModule(tokens), applicationModule],
    module: OpenApiPreviewRootModule,
  };
  const app = await NestFactory.create<NestFastifyApplication>(rootModule, new FastifyAdapter(), {
    abortOnError: false,
    logger: false,
    preview: true,
  });
  try {
    const swagger = load(resolve(process.cwd(), "libs/backend/common/swagger/lib/src/index.ts")) as SwaggerModule;
    const generated = swagger.createSwaggerDocument(app, {
      authSchemes: ["session-cookie"],
      enabled: true,
      title: appName,
    });
    if (!generated) throw new Error(`OpenAPI preview was not enabled for ${appName}.`);
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(generated.document, null, 2)}\n`);
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
