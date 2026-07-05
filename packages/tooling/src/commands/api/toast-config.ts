import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { parseArgs } from "../../runtime/args.ts";
import type { JsonValue, OpenApiDocument, OpenApiOperation, OpenApiResponse, OpenApiSchema } from "../qa/runtime-utils.ts";

const httpMethods = new Set(["get", "put", "post", "delete", "patch", "options", "head", "trace"]);
const categories = new Set(["success", "error", "warning", "info"]);
const displayModes = new Set(["toast", "modal", "custom", "silent"]);

type ToastCategory = "success" | "error" | "warning" | "info";

const categoryMeta: Record<ToastCategory, { icon: string; color: string; durationMs: number }> = {
  success: { icon: "check-circle", color: "green", durationMs: 4000 },
  error: { icon: "alert-circle", color: "red", durationMs: 8000 },
  warning: { icon: "alert-triangle", color: "amber", durationMs: 6000 },
  info: { icon: "info", color: "blue", durationMs: 5000 },
};

interface DiscoveredContract {
  app: string;
  path: string;
  relativePath: string;
}

interface ToastRule {
  id: string;
  endpoint: { app: string; method: string; path: string; operationId: string | null; tags: string[] };
  status: number | string;
  errorCode: string | null;
  match: { variant: string; fallbackVariant: string | null; networkVariant: string };
  display: {
    mode: "toast";
    category: ToastCategory;
    text: { key: string; default: string };
    icon: string;
    color: string;
    durationMs: number;
    options: { dismissible: boolean; position: string };
  };
  enabled: boolean;
}

interface ToastConfigFile {
  source?: { openapi?: string; app?: string };
  rules?: unknown[];
}

interface GeneratedConfig {
  path: string;
  config: unknown;
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

export interface ToastConfigRunOptions {
  argv?: string[];
  workspaceRoot?: string;
}

export function runToastConfigGenerate({ argv = [], workspaceRoot = process.cwd() }: ToastConfigRunOptions = {}): number {
  const parsed = parseArgs(argv);
  const outputRoot = parsed.options.get("output-root") ?? "apps/backend";
  const write = !parsed.flags.has("dry-run");
  const contracts = discoverOpenApiContracts(workspaceRoot, parsed.options.get("contracts-root"));
  const generated = generateToastConfigs({ workspaceRoot, contracts, outputRoot, write });
  console.log(JSON.stringify({ status: "generated", configs: generated.map((item) => item.path), dryRun: !write }));
  return 0;
}

export function runToastConfigCheck({ argv = [], workspaceRoot = process.cwd() }: ToastConfigRunOptions = {}): number {
  const parsed = parseArgs(argv);
  const outputRoot = parsed.options.get("output-root") ?? "apps/backend";
  const contracts = discoverOpenApiContracts(workspaceRoot, parsed.options.get("contracts-root"));
  const result = checkToastConfigs({ workspaceRoot, contracts, outputRoot });

  if (result.errors.length > 0) {
    console.error("API toast config check failed:");
    for (const error of result.errors) console.error(`- ${error}`);
    return 1;
  }

  console.log(JSON.stringify({ status: "ok", contracts: result.contracts, rules: result.rules }));
  return 0;
}

export function discoverOpenApiContracts(workspaceRoot = process.cwd(), contractsRoot?: string): DiscoveredContract[] {
  const roots = contractsRoot ? [join(workspaceRoot, contractsRoot)] : [join(workspaceRoot, "apps/backend")];
  const contracts: DiscoveredContract[] = [];

  for (const root of roots) visit(root);

  return contracts
    .filter((contract) => contract.path.endsWith(".json"))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  function visit(path: string): void {
    if (!existsSync(path)) return;
    const entries = readdirSync(path, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const entryPath = join(path, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const relativePath = relative(workspaceRoot, entryPath).replaceAll("\\", "/");
      if (!/apps\/backend\/[^/]+-app-api\/contracts\/openapi\/[^/]+\.json$/u.test(relativePath) && !contractsRoot) continue;
      const app = relativePath.split("/").at(-1)?.replace(/\.json$/u, "") ?? "";
      contracts.push({ app, path: entryPath, relativePath });
    }
  }
}

export function generateToastConfigs({ workspaceRoot = process.cwd(), contracts, outputRoot = "apps/backend", write = true }: { workspaceRoot?: string; contracts: DiscoveredContract[]; outputRoot?: string; write?: boolean }): GeneratedConfig[] {
  const generated: GeneratedConfig[] = [];
  for (const contract of contracts) {
    const doc = readJson<OpenApiDocument>(contract.path);
    const rules = collectToastRules(doc, contract.app);
    const config = {
      $schema: "https://nmime.dev/schemas/api-toast-rules.schema.json",
      version: 1,
      generatedBy: "@repo/tooling api toast-config generate",
      source: {
        openapi: contract.relativePath,
        app: contract.app,
      },
      runtimeContract: {
        resolutionOrder: ["endpoint+method+status+errorCode", "endpoint+method+status", "endpoint+method+network", "endpoint+method+errorFallback"],
        displayModes: [...displayModes],
        categories: [...categories],
      },
      rules,
    };
    const configPath = toastConfigPath(workspaceRoot, contract, outputRoot);
    if (write) writeJson(configPath, config);
    generated.push({ path: relative(workspaceRoot, configPath).replaceAll("\\", "/"), config });

    const frontendConfig = buildFrontendToastConfig(contract, rules);
    const frontendPath = frontendToastRulesPath(workspaceRoot, contract);
    if (write) writeJson(frontendPath, frontendConfig);
    generated.push({ path: relative(workspaceRoot, frontendPath).replaceAll("\\", "/"), config: frontendConfig });
  }
  return generated;
}

export function buildFrontendToastConfig(contract: DiscoveredContract, rules: ToastRule[]) {
  return {
    $schema: "https://nmime.dev/schemas/api-toast-rules-frontend.schema.json",
    version: 1,
    generatedBy: "@repo/tooling api toast-config generate",
    source: {
      openapi: contract.relativePath,
      app: contract.app,
    },
    rules: rules.filter((rule) => rule.enabled).map((rule) => ({
      display: rule.display.mode,
      id: rule.id,
      match: {
        ...(rule.errorCode ? { code: rule.errorCode } : {}),
        endpoint: rule.endpoint.path,
        method: rule.endpoint.method,
        ...(typeof rule.status === "number" ? { status: rule.status } : {}),
      },
      toast: {
        category: rule.display.category,
        title: rule.display.text.default,
      },
    })),
  };
}

function frontendToastRulesPath(workspaceRoot: string, contract: DiscoveredContract): string {
  return join(workspaceRoot, "libs/frontend/api-client/lib/src/generated/toast", `${contract.app}.toast-rules.frontend.generated.json`);
}

export function checkToastConfigs({ workspaceRoot = process.cwd(), contracts, outputRoot = "apps/backend" }: { workspaceRoot?: string; contracts: DiscoveredContract[]; outputRoot?: string }): { errors: string[]; contracts: number; rules: number } {
  const errors: string[] = [];
  let ruleCount = 0;
  const contractBySource = new Map(contracts.map((contract) => [contract.relativePath, contract]));

  for (const contract of contracts) {
    const expected = collectToastRules(readJson<OpenApiDocument>(contract.path), contract.app);
    const expectedByKey = new Map(expected.map((rule) => [ruleKey(rule), rule]));
    const configPath = toastConfigPath(workspaceRoot, contract, outputRoot);
    const relativeConfigPath = relative(workspaceRoot, configPath).replaceAll("\\", "/");

    if (!existsSync(configPath)) {
      errors.push(`${relativeConfigPath}: missing toast config; run pnpm run api:toast-config:generate`);
      continue;
    }

    let config: ToastConfigFile;
    try {
      config = readJson<ToastConfigFile>(configPath);
    } catch (error) {
      errors.push(`${relativeConfigPath}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    if (config?.source?.openapi !== contract.relativePath) errors.push(`${relativeConfigPath}: source.openapi must be ${contract.relativePath}`);
    if (config?.source?.app !== contract.app) errors.push(`${relativeConfigPath}: source.app must be ${contract.app}`);
    if (!contractBySource.has(config?.source?.openapi ?? "")) errors.push(`${relativeConfigPath}: source.openapi is not an app-local OpenAPI contract`);
    const configRules = config?.rules;
    if (!Array.isArray(configRules)) {
      errors.push(`${relativeConfigPath}: rules must be an array`);
      continue;
    }

    ruleCount += configRules.length;
    const seen = new Set<string>();
    for (const rule of configRules) {
      for (const validationError of validateRuleShape(rule)) errors.push(`${relativeConfigPath}: ${validationError}`);
      const key = ruleKey(rule);
      if (seen.has(key)) errors.push(`${relativeConfigPath}: duplicate rule ${key}`);
      seen.add(key);
      if (!expectedByKey.has(key)) errors.push(`${relativeConfigPath}: stale endpoint/status/error-code rule ${key}`);
    }

    for (const expectedRule of expected) {
      const key = ruleKey(expectedRule);
      if (!seen.has(key)) errors.push(`${relativeConfigPath}: missing endpoint/status/error-code rule ${key}`);
    }

    const frontendPath = frontendToastRulesPath(workspaceRoot, contract);
    const relativeFrontendPath = relative(workspaceRoot, frontendPath).replaceAll("\\", "/");
    if (!existsSync(frontendPath)) {
      errors.push(`${relativeFrontendPath}: missing frontend toast rules; run pnpm run api:toast-config:generate`);
      continue;
    }

    const expectedFrontend = formatJson(buildFrontendToastConfig(contract, expected));
    let actualFrontend: string;
    try {
      actualFrontend = formatJson(readJson(frontendPath));
    } catch (error) {
      errors.push(`${relativeFrontendPath}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    if (actualFrontend !== expectedFrontend) errors.push(`${relativeFrontendPath}: stale frontend toast rules; run pnpm run api:toast-config:generate`);
  }

  return { errors, contracts: contracts.length, rules: ruleCount };
}

export function collectToastRules(doc: OpenApiDocument, app: string): ToastRule[] {
  const rules: ToastRule[] = [];
  for (const [path, pathItem] of Object.entries(doc.paths ?? {}).sort(([left], [right]) => left.localeCompare(right))) {
    for (const [method, operation] of Object.entries(pathItem ?? {}).sort(([left], [right]) => left.localeCompare(right))) {
      if (!httpMethods.has(method)) continue;
      for (const [status, response] of Object.entries(operation.responses ?? {}).sort(([left], [right]) => left.localeCompare(right))) {
        const codes = responseErrorCodes(doc, response, status);
        for (const errorCode of codes) rules.push(buildRule({ app, path, method, operation, status, response, errorCode }));
      }
    }
  }
  return rules;
}

function buildRule({ app, path, method, operation, status, response, errorCode }: { app: string; path: string; method: string; operation: OpenApiOperation; status: string; response: OpenApiResponse; errorCode: string | null }): ToastRule {
  const numericStatus = Number(status);
  const category = statusCategory(status);
  const meta = categoryMeta[category];
  const upperMethod = method.toUpperCase();
  const operationLabel = humanize(operation.operationId ?? `${method} ${path}`);
  const statusLabel = humanize(response.description || status);
  const keyParts = ["api", "toast", app, slug(operation.operationId ?? path), method, status, errorCode].filter(Boolean);
  const variant = errorCode ? `${upperMethod}_${status}_${errorCode}` : `${upperMethod}_${status}`;
  const enabled = category === "error";

  return {
    id: `${app}:${upperMethod}:${path}:${status}${errorCode ? `:${errorCode}` : ""}`,
    endpoint: {
      app,
      method: upperMethod,
      path,
      operationId: operation.operationId ?? null,
      tags: Array.isArray(operation.tags) ? operation.tags : [],
    },
    status: Number.isFinite(numericStatus) ? numericStatus : status,
    errorCode: errorCode ?? null,
    match: {
      variant,
      fallbackVariant: numericStatus >= 400 ? `${upperMethod}_ERR` : null,
      networkVariant: `${upperMethod}_NET`,
    },
    display: {
      mode: "toast",
      category,
      text: {
        key: keyParts.map(slug).join("."),
        default: defaultText(category, operationLabel, statusLabel, errorCode),
      },
      icon: meta.icon,
      color: meta.color,
      durationMs: meta.durationMs,
      options: {
        dismissible: true,
        position: "top-right",
      },
    },
    enabled,
  };
}

function responseErrorCodes(doc: OpenApiDocument, response: OpenApiResponse, status: string): (string | null)[] {
  const numericStatus = Number(status);
  if (!Number.isFinite(numericStatus) || numericStatus < 400) return [null];

  const codes = new Set<string>();
  for (const media of Object.values(response?.content ?? {})) collectCodeValues(doc, media?.schema, codes);
  return codes.size > 0 ? [...codes].sort() : [null];
}

function collectCodeValues(doc: OpenApiDocument, schema: OpenApiSchema | undefined, codes: Set<string>, seen: Set<string> = new Set()): void {
  const resolved = dereference(doc, schema, seen);
  if (!resolved || typeof resolved !== "object") return;
  const codeSchema = resolved.properties?.code ?? resolved.properties?.errorCode;
  if (codeSchema) addSchemaValues(codeSchema, codes);
  for (const branch of [...(resolved.oneOf ?? []), ...(resolved.anyOf ?? []), ...(resolved.allOf ?? [])]) collectCodeValues(doc, branch, codes, new Set(seen));
}

function addSchemaValues(schema: OpenApiSchema, codes: Set<string>): void {
  if (typeof schema.const === "string") codes.add(schema.const);
  if (Array.isArray(schema.enum)) for (const value of schema.enum) if (typeof value === "string") codes.add(value);
  if (typeof schema.example === "string") codes.add(schema.example);
  if (typeof schema.default === "string") codes.add(schema.default);
  if (Array.isArray(schema.examples)) for (const value of schema.examples) if (typeof value === "string") codes.add(value);
}

function dereference(doc: OpenApiDocument, schema: OpenApiSchema | undefined, seen: Set<string> = new Set()): OpenApiSchema | undefined {
  if (!schema || typeof schema !== "object" || typeof schema.$ref !== "string") return schema;
  if (seen.has(schema.$ref)) return schema;
  seen.add(schema.$ref);
  const target = resolveJsonPointer(doc, schema.$ref);
  return target ? dereference(doc, target, seen) : schema;
}

function resolveJsonPointer(doc: OpenApiDocument, ref: string): OpenApiSchema | undefined {
  if (!ref.startsWith("#/")) return undefined;
  let current: unknown = doc;
  for (const part of ref.slice(2).split("/").map((value) => value.replaceAll("~1", "/").replaceAll("~0", "~"))) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  // Pointer targets in these contracts are schema/component objects.
  return current as OpenApiSchema | undefined;
}

function validateRuleShape(rule: unknown): string[] {
  if (!rule || typeof rule !== "object" || Array.isArray(rule)) return ["rule must be an object"];
  const record = rule as Record<string, unknown>;
  const prefix = typeof record.id === "string" ? record.id : "<missing-id>";
  const endpoint = toRecord(record.endpoint);
  const display = toRecord(record.display);
  const text = toRecord(display?.text);
  const match = toRecord(record.match);
  const mode = display?.mode;
  const category = display?.category;
  const errors: string[] = [];
  if (typeof record.id !== "string" || record.id.length === 0) errors.push(`${prefix}: id must be a non-empty string`);
  if (!endpoint) errors.push(`${prefix}: endpoint must be an object`);
  if (typeof endpoint?.app !== "string") errors.push(`${prefix}: endpoint.app must be a string`);
  if (typeof endpoint?.method !== "string" || endpoint.method !== endpoint.method.toUpperCase()) errors.push(`${prefix}: endpoint.method must be uppercase`);
  if (typeof endpoint?.path !== "string" || !endpoint.path.startsWith("/")) errors.push(`${prefix}: endpoint.path must start with /`);
  if (!(typeof record.status === "number" || record.status === "default")) errors.push(`${prefix}: status must be a number or default`);
  if (!(record.errorCode === null || typeof record.errorCode === "string")) errors.push(`${prefix}: errorCode must be null or string`);
  if (!match || typeof match.variant !== "string") errors.push(`${prefix}: match.variant must be a string`);
  if (!display) errors.push(`${prefix}: display must be an object`);
  if (typeof mode !== "string" || !displayModes.has(mode)) errors.push(`${prefix}: display.mode must be one of ${[...displayModes].join(", ")}`);
  if (typeof category !== "string" || !categories.has(category)) errors.push(`${prefix}: display.category must be one of ${[...categories].join(", ")}`);
  if (typeof text?.key !== "string" || text.key.length === 0) errors.push(`${prefix}: display.text.key must be a non-empty string`);
  if (typeof text?.default !== "string" || text.default.length === 0) errors.push(`${prefix}: display.text.default must be a non-empty string`);
  if (typeof display?.icon !== "string" || display.icon.length === 0) errors.push(`${prefix}: display.icon must be a non-empty string`);
  if (typeof display?.color !== "string" || display.color.length === 0) errors.push(`${prefix}: display.color must be a non-empty string`);
  if (typeof display?.durationMs !== "number" || display.durationMs < 0) errors.push(`${prefix}: display.durationMs must be a non-negative number`);
  if (!toRecord(display?.options)) errors.push(`${prefix}: display.options must be an object`);
  if (typeof record.enabled !== "boolean") errors.push(`${prefix}: enabled must be a boolean`);
  return errors;
}

function ruleKey(rule: unknown): string {
  const record = toRecord(rule);
  const endpoint = toRecord(record?.endpoint);
  const errorCode = typeof record?.errorCode === "string" ? record.errorCode : "";
  return [endpoint?.app, endpoint?.method, endpoint?.path, String(record?.status), errorCode].join("|");
}

function toastConfigPath(workspaceRoot: string, contract: DiscoveredContract, outputRoot: string): string {
  const relativeContractDir = dirname(contract.relativePath).replace(/\/openapi$/u, "/toast");
  if (outputRoot === "apps/backend") return join(workspaceRoot, relativeContractDir, `${contract.app}.toast-rules.generated.json`);
  return join(workspaceRoot, outputRoot, `${contract.app}.toast-rules.generated.json`);
}

function readJson<T = JsonValue>(path: string): T {
  // Parsed JSON is annotated with the shape the caller reads; access is guarded.
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${formatJson(value)}\n`);
}

function formatJson(value: unknown): string {
  return formatJsonValue(value, 0);
}

function formatJsonValue(value: unknown, depth: number): string {
  if (Array.isArray(value)) return formatJsonArray(value, depth);
  if (value && typeof value === "object") return formatJsonObject(value, depth);
  return JSON.stringify(value);
}

function formatJsonArray(values: unknown[], depth: number): string {
  if (values.length === 0) return "[]";
  if (values.every((value) => value === null || ["string", "number", "boolean"].includes(typeof value))) {
    const inline = `[${values.map((value) => JSON.stringify(value)).join(", ")}]`;
    if (indent(depth).length + inline.length <= 80) return inline;
  }
  const childIndent = indent(depth + 1);
  return `[\n${values.map((value) => `${childIndent}${formatJsonValue(value, depth + 1)}`).join(",\n")}\n${indent(depth)}]`;
}

function formatJsonObject(value: object, depth: number): string {
  const entries = Object.entries(value);
  if (entries.length === 0) return "{}";
  const childIndent = indent(depth + 1);
  return `{\n${entries
    .map(([key, child]) => `${childIndent}${JSON.stringify(key)}: ${formatJsonValue(child, depth + 1)}`)
    .join(",\n")}\n${indent(depth)}}`;
}

function indent(depth: number): string {
  return "  ".repeat(depth);
}

function statusCategory(status: string): ToastCategory {
  const numericStatus = Number(status);
  if (Number.isFinite(numericStatus) && numericStatus >= 200 && numericStatus < 300) return "success";
  if (Number.isFinite(numericStatus) && numericStatus >= 400) return "error";
  if (Number.isFinite(numericStatus) && numericStatus >= 300) return "warning";
  return "info";
}

function defaultText(category: ToastCategory, operationLabel: string, statusLabel: string, errorCode: string | null): string {
  if (category === "success") return `${operationLabel} completed successfully.`;
  if (category === "error") return `${operationLabel} failed: ${humanize(errorCode ?? statusLabel)}.`;
  if (category === "warning") return `${operationLabel} returned ${statusLabel}.`;
  return `${operationLabel}: ${statusLabel}.`;
}

function humanize(value: unknown): string {
  return String(value)
    .replace(/Controller_/gu, " ")
    .replace(/[_:/{}-]+/gu, " ")
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .trim()
    .replace(/^./u, (char) => char.toUpperCase());
}

function slug(value: unknown): string {
  return String(value).toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-|-$/g, "");
}
