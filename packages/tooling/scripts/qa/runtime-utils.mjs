import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";

export const workspaceRoot = process.cwd();
export const httpMethods = new Set(["get", "put", "post", "delete", "patch", "options", "head", "trace"]);

export function parseArgs(argv = process.argv.slice(2)) {
  const flags = new Set();
  const options = new Map();
  const positional = [];
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

export function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function writeJson(path, value) {
  ensureDir(dirname(path));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function commandExists(command) {
  const result = process.platform === "win32" ? spawnSync("where", [command], { stdio: "ignore" }) : spawnSync("sh", ["-lc", `command -v ${JSON.stringify(command)} >/dev/null 2>&1`], { stdio: "ignore" });
  return result.status === 0;
}

export function run(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? workspaceRoot,
    env: { ...process.env, ...(options.env ?? {}) },
    encoding: "utf8",
    shell: options.shell ?? false,
    stdio: options.stdio ?? "pipe",
  });
  return { command: [command, ...args].join(" "), status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "", error: result.error?.message };
}

export function defaultIgnore(rel) {
  return [".git", "node_modules", "dist", "coverage", "test-results", "playwright-report", ".nx", ".cache"].some((item) => rel === item || rel.startsWith(`${item}/`));
}

export function collectFiles(root, options = {}) {
  const include = options.include ?? (() => true);
  const ignore = options.ignore ?? defaultIgnore;
  const files = [];
  function visit(path) {
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

export function textFileFilter(path, rel) {
  if (rel === "pnpm-lock.yaml") return false;
  if (/\.(png|jpe?g|gif|webp|ico|woff2?)$/i.test(rel)) return false;
  const ext = extname(path).toLowerCase();
  return ["", ".cjs", ".css", ".env", ".html", ".js", ".json", ".jsx", ".md", ".mjs", ".mts", ".sql", ".toml", ".ts", ".tsx", ".txt", ".yaml", ".yml"].includes(ext) || rel.includes("Dockerfile");
}

export function walkRefs(value, visit) {
  if (!value || typeof value !== "object") return;
  if (typeof value.$ref === "string") visit(value.$ref);
  for (const item of Array.isArray(value) ? value : Object.values(value)) walkRefs(item, visit);
}

export function resolveJsonPointer(doc, ref) {
  if (!ref.startsWith("#/")) return undefined;
  let current = doc;
  for (const part of ref.slice(2).split("/").map((value) => value.replaceAll("~1", "/").replaceAll("~0", "~"))) current = current?.[part];
  return current;
}

export function dereference(doc, schema, seen = new Set()) {
  if (!schema || typeof schema !== "object" || typeof schema.$ref !== "string") return schema;
  if (seen.has(schema.$ref)) return schema;
  seen.add(schema.$ref);
  const target = resolveJsonPointer(doc, schema.$ref);
  return target ? dereference(doc, target, seen) : schema;
}

export function loadOpenApiContracts(root = process.env.OPENAPI_CONTRACTS_ROOT ?? "contracts/openapi") {
  if (!existsSync(root)) throw new Error(`OpenAPI contracts directory not found: ${root}`);
  return readdirSync(root).filter((name) => name.endsWith(".json")).sort().map((file) => ({ file, path: join(root, file), doc: readJson(join(root, file)) }));
}

export function matchPathTemplate(template, requestPath) {
  const left = template.split("/").filter(Boolean);
  const right = requestPath.split("/").filter(Boolean);
  if (left.length !== right.length) return null;
  const params = {};
  for (let index = 0; index < left.length; index += 1) {
    const part = left[index];
    if (part.startsWith("{") && part.endsWith("}")) params[part.slice(1, -1)] = decodeURIComponent(right[index]);
    else if (part !== right[index]) return null;
  }
  return params;
}

export function findOperation(contract, method, requestPath) {
  const wanted = method.toLowerCase();
  for (const [template, item] of Object.entries(contract.doc.paths ?? {})) {
    const operation = item?.[wanted];
    if (!operation) continue;
    const params = matchPathTemplate(template, requestPath);
    if (params) return { template, operation, params };
  }
  return null;
}

export function schemaExample(schema, doc, seen = new Set()) {
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
    const output = {};
    const required = new Set(resolved.required ?? Object.keys(resolved.properties ?? {}));
    for (const [key, child] of Object.entries(resolved.properties ?? {})) if (required.has(key)) output[key] = schemaExample(child, doc, new Set(seen));
    return output;
  }
  return null;
}

export function validateSchema(value, schema, doc, path = "$", seen = new Set()) {
  const resolved = dereference(doc, schema, seen);
  if (!resolved || typeof resolved !== "object") return [];
  if (resolved.oneOf?.length || resolved.anyOf?.length) {
    const branches = resolved.oneOf ?? resolved.anyOf;
    return branches.some((branch) => validateSchema(value, branch, doc, path, new Set(seen)).length === 0) ? [] : [`${path}: does not match any schema branch`];
  }
  const errors = [];
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
    if (typeof value !== "object" || Array.isArray(value)) errors.push(`${path}: expected object`);
    else {
      for (const key of resolved.required ?? []) if (!Object.hasOwn(value, key)) errors.push(`${path}.${key}: missing required property`);
      for (const [key, child] of Object.entries(resolved.properties ?? {})) if (Object.hasOwn(value, key)) errors.push(...validateSchema(value[key], child, doc, `${path}.${key}`, new Set(seen)));
    }
  }
  return errors;
}

export function envList(name, fallback = []) {
  const raw = process.env[name];
  return raw ? raw.split(",").map((item) => item.trim()).filter(Boolean) : fallback;
}

export function slug(value) {
  return String(value).toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-|-$/g, "");
}
