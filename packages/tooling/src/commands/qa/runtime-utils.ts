import { spawnSync } from "node:child_process";
import type { SpawnSyncOptions, StdioOptions } from "node:child_process";
import type { Stats } from "node:fs";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { consumerContracts, openApiContracts } from "../api/contracts-manifest.ts";

/** Any value produced by JSON.parse; used where a shape is intentionally open. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Minimal structural view of the OpenAPI 3 documents these tools read. Every
 * field is optional because the tools are validators/linters that must guard
 * against malformed input; value-carrying fields are `unknown` because example
 * and enum payloads are genuinely open.
 */
export interface OpenApiSchema {
  $ref?: string;
  type?: string | string[];
  format?: string;
  nullable?: boolean;
  minLength?: number;
  minimum?: number;
  required?: string[];
  enum?: unknown[];
  const?: unknown;
  example?: unknown;
  examples?: unknown[];
  default?: unknown;
  properties?: Record<string, OpenApiSchema>;
  items?: OpenApiSchema;
  oneOf?: OpenApiSchema[];
  anyOf?: OpenApiSchema[];
  allOf?: OpenApiSchema[];
}

export interface OpenApiMediaType {
  schema?: OpenApiSchema;
}

export interface OpenApiResponse {
  description?: string;
  content?: Record<string, OpenApiMediaType>;
}

export interface OpenApiRequestBody {
  content?: Record<string, OpenApiMediaType>;
}

export type OpenApiSecurityRequirement = Record<string, string[]>;

export interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  tags?: string[];
  responses?: Record<string, OpenApiResponse>;
  requestBody?: OpenApiRequestBody;
  security?: OpenApiSecurityRequirement[];
}

/**
 * A path item maps HTTP method names to operations. Non-method keys (e.g.
 * `parameters`) may exist at runtime; callers filter by {@link httpMethods}
 * before treating a value as an operation.
 */
export type OpenApiPathItem = Record<string, OpenApiOperation>;

export interface OpenApiSecurityScheme {
  type?: string;
  scheme?: string;
  in?: string;
  name?: string;
}

export interface OpenApiDocument {
  openapi?: string;
  info?: { title?: string; version?: string };
  servers?: unknown[];
  paths?: Record<string, OpenApiPathItem>;
  components?: {
    securitySchemes?: Record<string, OpenApiSecurityScheme>;
    schemas?: Record<string, OpenApiSchema>;
  };
}

export interface LoadedOpenApiContract {
  file: string;
  path: string;
  doc: OpenApiDocument;
}

/** Consumer (Pact-style) contract shape, limited to the fields consumed here. */
export interface PactRequest {
  method?: string;
  path?: string;
  pathname?: string;
  headers?: Record<string, unknown>;
  body?: unknown;
}

export interface PactResponse {
  status?: number | string;
  statusCode?: number | string;
  headers?: Record<string, unknown>;
  body?: unknown;
}

export interface PactInteraction {
  description?: string;
  request?: PactRequest;
  response?: PactResponse;
}

export interface PactDocument {
  provider?: { name?: string };
  providerName?: string;
  interactions?: PactInteraction[];
}

export interface LoadedConsumerContract {
  file: string;
  path: string;
  doc: PactDocument;
}

export interface ParsedArgs {
  flags: Set<string>;
  options: Map<string, string>;
  positional: string[];
}

export interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  shell?: boolean;
  stdio?: StdioOptions;
}

export interface RunResult {
  command: string;
  status: number;
  stdout: string;
  stderr: string;
  error?: string;
}

export interface CollectFilesOptions {
  include?: (path: string, rel: string, stat: Stats) => boolean;
  ignore?: (rel: string) => boolean;
}

export const workspaceRoot = process.cwd();
export const httpMethods = new Set(["get", "put", "post", "delete", "patch", "options", "head", "trace"]);

export function parseArgs(argv: string[] = process.argv.slice(2)): ParsedArgs {
  const flags = new Set<string>();
  const options = new Map<string, string>();
  const positional: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      positional.push(value);
      continue;
    }
    const raw = value.slice(2);
    const equals = raw.indexOf("=");
    if (equals >= 0) {
      options.set(raw.slice(0, equals), raw.slice(equals + 1));
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      options.set(raw, next);
      index += 1;
    } else {
      flags.add(raw);
    }
  }
  return { flags, options, positional };
}

export function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

export function readJson<T = JsonValue>(path: string): T {
  // JSON.parse yields `any`; the caller declares the shape it expects and the
  // reading code guards each field. Defaults to the open `JsonValue` type.
  return JSON.parse(readFileSync(path, "utf8"));
}

export function writeJson(path: string, value: unknown): void {
  ensureDir(dirname(path));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function commandExists(command: string): boolean {
  const result = process.platform === "win32" ? spawnSync("where", [command], { stdio: "ignore" }) : spawnSync("sh", ["-c", `command -v ${JSON.stringify(command)} >/dev/null 2>&1`], { stdio: "ignore" });
  return result.status === 0;
}

export function run(command: string, args: string[] = [], options: RunOptions = {}): RunResult {
  const spawnOptions: SpawnSyncOptions = {
    cwd: options.cwd ?? workspaceRoot,
    env: { ...process.env, ...(options.env ?? {}) },
    encoding: "utf8",
    shell: options.shell ?? false,
    stdio: options.stdio ?? "pipe",
  };
  const result = spawnSync(command, args, spawnOptions);
  return {
    command: [command, ...args].join(" "),
    status: result.status ?? 1,
    stdout: typeof result.stdout === "string" ? result.stdout : "",
    stderr: typeof result.stderr === "string" ? result.stderr : "",
    error: result.error?.message,
  };
}

export function defaultIgnore(rel: string): boolean {
  const ignoredSegments = new Set([
    ".git",
    "node_modules",
    "dist",
    "coverage",
    "test-results",
    "playwright-report",
    "validation-logs",
    "tmp",
    ".nx",
    ".cache",
    ".stryker-tmp",
  ]);
  return rel.split("/").some((segment) => ignoredSegments.has(segment));
}

export function collectFiles(root: string, options: CollectFilesOptions = {}): string[] {
  const include = options.include ?? (() => true);
  const ignore = options.ignore ?? defaultIgnore;
  const files: string[] = [];
  function visit(path: string): void {
    if (!existsSync(path)) return;
    const rel = relative(workspaceRoot, path).replaceAll("\\", "/");
    if (rel && ignore(rel)) return;
    const stat = statSync(path);
    if (stat.isDirectory()) for (const entry of readdirSync(path).sort()) visit(join(path, entry));
    else if (stat.isFile() && include(path, rel, stat)) files.push(path);
  }
  visit(root);
  return files;
}

export function textFileFilter(path: string, rel: string): boolean {
  if (rel === "pnpm-lock.yaml") return false;
  if (/\.(png|jpe?g|gif|webp|ico|woff2?)$/i.test(rel)) return false;
  const ext = extname(path).toLowerCase();
  return ["", ".cjs", ".css", ".env", ".html", ".js", ".json", ".jsx", ".md", ".mjs", ".mts", ".sql", ".toml", ".ts", ".tsx", ".txt", ".yaml", ".yml"].includes(ext) || rel.includes("Dockerfile");
}

export function walkRefs(value: unknown, visit: (ref: string) => void): void {
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (typeof record.$ref === "string") visit(record.$ref);
  for (const item of Array.isArray(value) ? value : Object.values(record)) walkRefs(item, visit);
}

export function resolveJsonPointer(doc: OpenApiDocument, ref: string): OpenApiSchema | undefined {
  if (!ref.startsWith("#/")) return undefined;
  let current: unknown = doc;
  for (const part of ref.slice(2).split("/").map((value) => value.replaceAll("~1", "/").replaceAll("~0", "~"))) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  // Pointer targets in these contracts are schema/component objects.
  return current as OpenApiSchema | undefined;
}

export function dereference(doc: OpenApiDocument, schema: OpenApiSchema | undefined, seen: Set<string> = new Set()): OpenApiSchema | undefined {
  if (!schema || typeof schema !== "object" || typeof schema.$ref !== "string") return schema;
  if (seen.has(schema.$ref)) return schema;
  seen.add(schema.$ref);
  const target = resolveJsonPointer(doc, schema.$ref);
  return target ? dereference(doc, target, seen) : schema;
}

export function loadOpenApiContracts(root: string | undefined = process.env.OPENAPI_CONTRACTS_ROOT): LoadedOpenApiContract[] {
  if (root) {
    if (!existsSync(root)) throw new Error(`OpenAPI contracts directory not found: ${root}`);
    return readdirSync(root).filter((name) => name.endsWith(".json")).sort().map((file) => ({ file, path: join(root, file), doc: readJson<OpenApiDocument>(join(root, file)) }));
  }
  return openApiContracts().map((contract) => ({ file: `${contract.name}.json`, path: contract.artifactPath, doc: readJson<OpenApiDocument>(contract.artifactPath) }));
}

export function loadConsumerContracts(root: string | undefined = process.env.CONSUMER_CONTRACTS_ROOT): LoadedConsumerContract[] {
  if (root) {
    if (!existsSync(root)) throw new Error(`Consumer contract directory not found: ${root}`);
    return readdirSync(root).filter((name) => name.endsWith(".json")).sort().map((file) => ({ file, path: join(root, file), doc: readJson<PactDocument>(join(root, file)) }));
  }
  return consumerContracts().map((contract) => ({ file: contract.artifactPath.split("/").at(-1) ?? contract.artifactPath, path: contract.artifactPath, doc: readJson<PactDocument>(contract.artifactPath) }));
}

export function matchPathTemplate(template: string, requestPath: string): Record<string, string> | null {
  const left = template.split("/").filter(Boolean);
  const right = requestPath.split("/").filter(Boolean);
  if (left.length !== right.length) return null;
  const params: Record<string, string> = {};
  for (let index = 0; index < left.length; index += 1) {
    const part = left[index];
    if (part.startsWith("{") && part.endsWith("}")) params[part.slice(1, -1)] = decodeURIComponent(right[index]);
    else if (part !== right[index]) return null;
  }
  return params;
}

export interface OperationMatch {
  template: string;
  operation: OpenApiOperation;
  params: Record<string, string>;
}

export function findOperation(contract: LoadedOpenApiContract, method: string, requestPath: string): OperationMatch | null {
  const wanted = method.toLowerCase();
  for (const [template, item] of Object.entries(contract.doc.paths ?? {})) {
    const operation = item[wanted];
    if (!operation) continue;
    const params = matchPathTemplate(template, requestPath);
    if (params) return { template, operation, params };
  }
  return null;
}

export function schemaExample(schema: OpenApiSchema | undefined, doc: OpenApiDocument, seen: Set<string> = new Set()): unknown {
  const resolved = dereference(doc, schema, seen);
  if (!resolved || typeof resolved !== "object") return null;
  if (Object.hasOwn(resolved, "example")) return resolved.example;
  if (Array.isArray(resolved.examples) && resolved.examples.length) return resolved.examples[0];
  if (Array.isArray(resolved.enum) && resolved.enum.length) return resolved.enum[0];
  if (resolved.default !== undefined) return resolved.default;
  if (resolved.oneOf?.length) return schemaExample(resolved.oneOf[0], doc, new Set(seen));
  if (resolved.anyOf?.length) return schemaExample(resolved.anyOf[0], doc, new Set(seen));
  const type = Array.isArray(resolved.type) ? resolved.type.find((item) => item !== "null") : resolved.type;
  if (type === "string" || resolved.format) {
    if (resolved.format === "email") return "contract@example.com";
    if (resolved.format === "uuid") return "00000000-0000-4000-8000-000000000000";
    if (resolved.format === "date-time") return "2026-01-01T00:00:00.000Z";
    if (resolved.minLength && resolved.minLength > 6) return "x".repeat(resolved.minLength);
    return "string";
  }
  if (type === "integer" || type === "number") return resolved.minimum ?? 1;
  if (type === "boolean") return true;
  if (type === "array") return [schemaExample(resolved.items ?? {}, doc, new Set(seen))];
  if (type === "object" || resolved.properties) {
    const output: Record<string, unknown> = {};
    const required = new Set(resolved.required ?? Object.keys(resolved.properties ?? {}));
    for (const [key, child] of Object.entries(resolved.properties ?? {})) if (required.has(key)) output[key] = schemaExample(child, doc, new Set(seen));
    return output;
  }
  return null;
}

export function validateSchema(value: unknown, schema: OpenApiSchema | undefined, doc: OpenApiDocument, path = "$", seen: Set<string> = new Set()): string[] {
  const resolved = dereference(doc, schema, seen);
  if (!resolved || typeof resolved !== "object") return [];
  if (resolved.oneOf?.length || resolved.anyOf?.length) {
    const branches = resolved.oneOf ?? resolved.anyOf ?? [];
    return branches.some((branch) => validateSchema(value, branch, doc, path, new Set(seen)).length === 0) ? [] : [`${path}: does not match any schema branch`];
  }
  const errors: string[] = [];
  if (value === null) return resolved.nullable || resolved.type === "null" || (Array.isArray(resolved.type) && resolved.type.includes("null")) ? [] : [`${path}: expected non-null value`];
  if (Array.isArray(resolved.enum) && !resolved.enum.includes(value)) errors.push(`${path}: expected one of ${resolved.enum.join(", ")}`);
  const type = Array.isArray(resolved.type) ? resolved.type.find((item) => item !== "null") : resolved.type;
  if (type === "string" || resolved.format) {
    if (typeof value !== "string") errors.push(`${path}: expected string`);
    if (typeof value === "string" && resolved.minLength !== undefined && value.length < resolved.minLength) errors.push(`${path}: shorter than minLength ${resolved.minLength}`);
  } else if (type === "integer" && !Number.isInteger(value)) errors.push(`${path}: expected integer`);
  else if (type === "number" && typeof value !== "number") errors.push(`${path}: expected number`);
  else if (type === "boolean" && typeof value !== "boolean") errors.push(`${path}: expected boolean`);
  else if (type === "array") {
    if (!Array.isArray(value)) errors.push(`${path}: expected array`);
    else value.forEach((item, index) => errors.push(...validateSchema(item, resolved.items ?? {}, doc, `${path}[${index}]`, new Set(seen))));
  } else if (type === "object" || resolved.properties || resolved.required) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) errors.push(`${path}: expected object`);
    else {
      const record = value as Record<string, unknown>;
      for (const key of resolved.required ?? []) if (!Object.hasOwn(record, key)) errors.push(`${path}.${key}: missing required property`);
      for (const [key, child] of Object.entries(resolved.properties ?? {})) if (Object.hasOwn(record, key)) errors.push(...validateSchema(record[key], child, doc, `${path}.${key}`, new Set(seen)));
    }
  }
  return errors;
}

export function envList(name: string, fallback: string[] = []): string[] {
  const raw = process.env[name];
  return raw ? raw.split(",").map((item) => item.trim()).filter(Boolean) : fallback;
}

export function slug(value: unknown): string {
  return String(value).toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-|-$/g, "");
}
