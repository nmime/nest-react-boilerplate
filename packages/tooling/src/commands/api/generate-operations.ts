/**
 * Renders the mechanically derivable half of a frontend API client.
 *
 * `openapi-typescript` stops at `paths` and `components`, which leaves every consumer
 * hand-writing the same three shapes per endpoint — a schema alias, a typed callable, and a
 * React Query key. Those are pure functions of the OpenAPI document, so they are generated here
 * and covered by `api:clients:check` instead of drifting inside a shared library that every
 * upstream change then conflicts with. Anything that is NOT derivable — Better-Auth glue,
 * bespoke envelopes, hooks with product-specific cache policy — stays hand-written.
 */

export interface OpenApiOperation {
  operationId?: string;
  parameters?: Array<{ name?: string; in?: string; required?: boolean }>;
  requestBody?: {
    required?: boolean;
    content?: Record<string, { schema?: { $ref?: string } }>;
  };
}

export interface OpenApiDocument {
  paths?: Record<string, Record<string, unknown>>;
  components?: { schemas?: Record<string, unknown> };
}

/**
 * The HTTP verbs `openapi-fetch` exposes as client methods. A document may legitimately describe
 * others (Better-Auth's catch-all route declares `search`); those are reported rather than
 * emitted, because a callable that cannot compile is worse than a documented gap.
 */
const fetchMethods = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
] as const;

type FetchMethod = (typeof fetchMethods)[number];

interface EmittedOperation {
  method: FetchMethod;
  path: string;
  pascal: string;
  camel: string;
  pathConstant: string;
  pathParameters: string[];
  hasBody: boolean;
  bodySchema?: string;
  bodyRequired: boolean;
  hasQuery: boolean;
  queryRequired: boolean;
}

function isFetchMethod(value: string): value is FetchMethod {
  return (fetchMethods as readonly string[]).includes(value);
}

/** `AuthController_register` -> `AuthControllerRegister`. */
export function operationPascalCase(operationId: string): string {
  return operationId
    .split(/[^A-Za-z0-9]+/u)
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join("");
}

function operationCamelCase(operationId: string): string {
  const pascal = operationPascalCase(operationId);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/** `/auth/provider-identities/{identityId}` -> `["identityId"]`. */
function pathParameterNames(path: string): string[] {
  return [...path.matchAll(/\{([^}]+)\}/gu)].map((match) => match[1] ?? "");
}

function schemaRefName(operation: OpenApiOperation): string | undefined {
  const ref = operation.requestBody?.content?.["application/json"]?.schema?.$ref;
  return ref?.startsWith("#/components/schemas/")
    ? ref.slice("#/components/schemas/".length)
    : undefined;
}

function collectOperations(document: OpenApiDocument): {
  operations: EmittedOperation[];
  skipped: string[];
} {
  const operations: EmittedOperation[] = [];
  const skipped: string[] = [];
  const seen = new Map<string, string>();

  for (const [path, methods] of Object.entries(document.paths ?? {})) {
    for (const method of Object.keys(methods)) {
      const operation = methods[method] as OpenApiOperation | undefined;
      if (!operation || typeof operation !== "object") continue;

      const operationId = operation.operationId;
      if (!operationId) {
        skipped.push(`${method.toUpperCase()} ${path} (no operationId)`);
        continue;
      }
      if (!isFetchMethod(method)) {
        skipped.push(`${method.toUpperCase()} ${path} (unsupported by openapi-fetch)`);
        continue;
      }

      const pascal = operationPascalCase(operationId);
      const previous = seen.get(pascal);
      if (previous !== undefined) {
        throw new Error(
          `Duplicate operationId ${operationId}: ${previous} and ${method.toUpperCase()} ${path} both resolve to ${pascal}.`,
        );
      }
      seen.set(pascal, `${method.toUpperCase()} ${path}`);

      const parameters = operation.parameters ?? [];
      const queryParameters = parameters.filter((parameter) => parameter.in === "query");

      operations.push({
        method,
        path,
        pascal,
        camel: operationCamelCase(operationId),
        pathConstant: `${operationCamelCase(operationId)}Path`,
        pathParameters: pathParameterNames(path),
        hasBody: operation.requestBody !== undefined,
        ...(schemaRefName(operation) === undefined
          ? {}
          : { bodySchema: schemaRefName(operation) }),
        bodyRequired: operation.requestBody?.required !== false,
        hasQuery: queryParameters.length > 0,
        queryRequired: queryParameters.some((parameter) => parameter.required === true),
      });
    }
  }

  return { operations, skipped };
}

function renderCallable(operation: EmittedOperation): string {
  const args = operation.pathParameters.map((name) => `${name}: string`);
  if (operation.hasBody) {
    const bodyType = operation.bodySchema ?? `${operation.pascal}Body`;
    args.push(`body${operation.bodyRequired ? "" : "?"}: ${bodyType}`);
  }
  if (operation.hasQuery) {
    args.push(`query${operation.queryRequired ? "" : "?"}: ${operation.pascal}Query`);
  }
  args.push("options?: ApiClientRequestOptions");

  const init: string[] = ["...toOpenApiFetchOptions(options)"];
  const params: string[] = [];
  if (operation.pathParameters.length > 0) {
    params.push(`path: { ${operation.pathParameters.join(", ")} }`);
  }
  if (operation.hasQuery) params.push("query");
  if (params.length > 0) init.push(`params: { ${params.join(", ")} }`);
  if (operation.hasBody) init.push("body");

  const callArguments =
    init.length === 1
      ? `${operation.pathConstant}, toOpenApiFetchOptions(options)`
      : `${operation.pathConstant}, {\n    ${init.join(",\n    ")},\n  }`;

  return `export const ${operation.camel} = (${args.join(", ")}) =>\n  client.${operation.method.toUpperCase()}(${callArguments});`;
}

function renderOperationTypes(operation: EmittedOperation): string[] {
  const lines: string[] = [];
  if (operation.hasQuery) {
    lines.push(
      `export type ${operation.pascal}Query = NonNullable<paths[typeof ${operation.pathConstant}]['${operation.method}']['parameters']['query']>;`,
    );
  }
  if (operation.hasBody && operation.bodySchema === undefined) {
    lines.push(
      `export type ${operation.pascal}Body = NonNullable<paths[typeof ${operation.pathConstant}]['${operation.method}']['requestBody']>['content']['application/json'];`,
    );
  }
  return lines;
}

export interface RenderOperationsOptions {
  /** Module specifier of the `openapi-typescript` output, e.g. `./auth`. */
  typesModule: string;
  /** Workspace-relative OpenAPI artifact the module was rendered from. */
  sourcePath: string;
  /** Module specifier of the hand-written request helpers. */
  supportModule?: string;
}

export function renderOperationsModule(
  document: OpenApiDocument,
  { typesModule, sourcePath, supportModule = "../service-options" }: RenderOperationsOptions,
): string {
  const { operations, skipped } = collectOperations(document);
  const schemaNames = Object.keys(document.components?.schemas ?? {}).sort((left, right) =>
    left.localeCompare(right),
  );
  const reservedNames = new Set(
    operations.flatMap((operation) => [
      `${operation.pascal}Response`,
      `${operation.pascal}Data`,
      `${operation.pascal}Error`,
      `${operation.pascal}Query`,
      `${operation.pascal}Body`,
    ]),
  );

  const sections: string[] = [];

  sections.push(
    [
      "/**",
      " * Generated by `pnpm api:clients`. Do not edit by hand.",
      ` * Source: ${sourcePath}`,
      " *",
      " * Every export here is derived from the OpenAPI document, so `pnpm api:clients:check`",
      " * fails when a renamed or removed operation leaves this module stale. Hand-written",
      " * additions belong beside it, never inside it.",
      skipped.length > 0 ? " *" : undefined,
      skipped.length > 0 ? " * Not emitted:" : undefined,
      ...skipped.map((entry) => ` * - ${entry}`),
      " */",
    ]
      .filter((line): line is string => line !== undefined)
      .join("\n"),
  );

  sections.push(
    [
      "import createClient from 'openapi-fetch';",
      `import type { components, paths } from '${typesModule}';`,
      "import {",
      "  toOpenApiFetchOptions,",
      "  type ApiClientRequestOptions,",
      "  type EnvelopeData,",
      "  type OpenApiData,",
      "  type OpenApiError,",
      `} from '${supportModule}';`,
    ].join("\n"),
  );

  sections.push("export const client = createClient<paths>();");

  if (schemaNames.length > 0) {
    sections.push(
      schemaNames
        .filter((name) => !reservedNames.has(name))
        .map((name) => `export type ${name} = components['schemas']['${name}'];`)
        .join("\n"),
    );
  }

  if (operations.length > 0) {
    sections.push(
      operations
        .map((operation) => `export const ${operation.pathConstant} = '${operation.path}' as const;`)
        .join("\n"),
    );

    for (const operation of operations) {
      sections.push(
        [
          ...renderOperationTypes(operation),
          renderCallable(operation),
          `export type ${operation.pascal}Response = OpenApiData<typeof ${operation.camel}>;`,
          `export type ${operation.pascal}Data = EnvelopeData<${operation.pascal}Response>;`,
          `export type ${operation.pascal}Error = OpenApiError<typeof ${operation.camel}>;`,
        ].join("\n"),
      );
    }

    sections.push(
      operations
        .map((operation) =>
          operation.method === "get"
            ? `export const get${operation.pascal}QueryKey = () => ['${operation.method}', ${operation.pathConstant}] as const;`
            : `export const get${operation.pascal}MutationKey = () => ['${operation.method}', ${operation.pathConstant}] as const;`,
        )
        .join("\n"),
    );
  }

  return `${sections.join("\n\n")}\n`;
}
