import { existsSync } from "node:fs";
import { join, posix } from "node:path";
import type { CommandContext } from "../../cli.js";
import { run, type RunResult } from "../../runtime/process.js";

export const shadcnWorkspaceDirectory = "libs/frontend";
export const shadcnComponentDirectory = "ui-web/lib/src/component";
export const shadcnSharedUiSourceDirectory = "libs/frontend/ui-web/lib/src/component";

export type UiRegistrySource = "aceternity" | "magicui" | "shadcn";

interface UiRegistryPolicy {
  apply: boolean;
  license: string;
  namespace: string;
  note: string;
}

export const uiRegistryPolicies: Readonly<Record<UiRegistrySource, UiRegistryPolicy>> = {
  shadcn: {
    apply: true,
    license: "MIT",
    namespace: "@shadcn",
    note: "Canonical accessible web primitives.",
  },
  magicui: {
    apply: true,
    license: "MIT",
    namespace: "@magicui",
    note: "Optional reviewed motion and presentation components.",
  },
  aceternity: {
    apply: false,
    license: "Aceternity License",
    namespace: "@aceternity",
    note: "Research-only in this template: search and non-persistent preview are allowed, but the template never applies or distributes Aceternity source. A downstream product owner must independently review the current license and own its integration, dependencies, source, and tests.",
  },
};

const componentNamePattern = /^[a-z0-9][a-z0-9-]*$/;
const sourceNames = new Set<UiRegistrySource>(["aceternity", "magicui", "shadcn"]);

export interface UiRegistryAddArgs {
  apply: boolean;
  components: string[];
  diff: boolean;
  dryRun: boolean;
  error?: string;
  help: boolean;
  overwrite: boolean;
  source?: UiRegistrySource;
  view: boolean;
}

export interface UiRegistrySearchArgs {
  error?: string;
  help: boolean;
  limit: number;
  offset: number;
  query?: string;
  source?: UiRegistrySource;
  type?: "block" | "hook" | "ui";
}

export function parseUiRegistryAddArgs(argv: string[], defaultSource?: UiRegistrySource): UiRegistryAddArgs {
  const parsed: UiRegistryAddArgs = {
    apply: false,
    components: [],
    diff: false,
    dryRun: true,
    help: false,
    overwrite: false,
    source: defaultSource,
    view: false,
  };
  let requestedDryRun = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? "";
    if (token === "--help" || token === "-h") {
      parsed.help = true;
      continue;
    }
    if (token === "--source") {
      if (defaultSource !== undefined) {
        return { ...parsed, error: "The shadcn-specific command does not accept --source." };
      }
      const source = argv[index + 1];
      if (source === undefined || !sourceNames.has(source as UiRegistrySource)) {
        return { ...parsed, error: `--source must be one of: ${[...sourceNames].join(", ")}.` };
      }
      parsed.source = source as UiRegistrySource;
      index += 1;
      continue;
    }
    if (token.startsWith("--source=")) {
      if (defaultSource !== undefined) {
        return { ...parsed, error: "The shadcn-specific command does not accept --source." };
      }
      const source = token.slice("--source=".length);
      if (!sourceNames.has(source as UiRegistrySource)) {
        return { ...parsed, error: `--source must be one of: ${[...sourceNames].join(", ")}.` };
      }
      parsed.source = source as UiRegistrySource;
      continue;
    }
    if (token === "--apply") {
      if (requestedDryRun) return { ...parsed, error: "--apply cannot be combined with --dry-run." };
      parsed.apply = true;
      parsed.dryRun = false;
      continue;
    }
    if (token === "--dry-run") {
      if (parsed.apply) return { ...parsed, error: "--apply cannot be combined with --dry-run." };
      requestedDryRun = true;
      continue;
    }
    if (token === "--overwrite") {
      parsed.overwrite = true;
      continue;
    }
    if (token === "--view") {
      parsed.view = true;
      continue;
    }
    if (token === "--diff") {
      parsed.diff = true;
      continue;
    }
    if (token === "--") {
      return { ...parsed, error: "Forwarding arbitrary shadcn CLI options is not allowed." };
    }
    if (token.startsWith("-") || token.includes("/") || token.includes(":")) {
      return { ...parsed, error: `Unsupported registry item or option: ${token}` };
    }
    if (!componentNamePattern.test(token)) {
      return { ...parsed, error: `Registry item names must be lowercase kebab-case; received: ${token}` };
    }
    if (parsed.components.includes(token)) {
      return { ...parsed, error: `Duplicate registry item name: ${token}` };
    }
    parsed.components.push(token);
  }

  if (!parsed.help && parsed.source === undefined) {
    return { ...parsed, error: "Select an explicit registry with --source shadcn|magicui|aceternity." };
  }
  if (!parsed.help && parsed.components.length === 0) {
    return { ...parsed, error: "Provide at least one registry item name." };
  }
  if (parsed.overwrite && !parsed.apply) {
    return { ...parsed, error: "--overwrite requires --apply." };
  }
  if (parsed.apply && parsed.source !== undefined && !uiRegistryPolicies[parsed.source].apply) {
    return {
      ...parsed,
      error: `${parsed.source} cannot be applied by this public source template. ${uiRegistryPolicies[parsed.source].note}`,
    };
  }

  return parsed;
}

export function parseUiRegistrySearchArgs(argv: string[]): UiRegistrySearchArgs {
  const parsed: UiRegistrySearchArgs = { help: false, limit: 20, offset: 0 };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? "";
    if (token === "--help" || token === "-h") {
      parsed.help = true;
      continue;
    }
    if (token === "--source") {
      const source = argv[index + 1];
      if (source === undefined || !sourceNames.has(source as UiRegistrySource)) {
        return { ...parsed, error: `--source must be one of: ${[...sourceNames].join(", ")}.` };
      }
      parsed.source = source as UiRegistrySource;
      index += 1;
      continue;
    }
    if (token === "--query" || token === "--type" || token === "--limit" || token === "--offset") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("-")) {
        return { ...parsed, error: `${token} requires a value.` };
      }
      if (token === "--query") parsed.query = value;
      if (token === "--type") {
        if (!new Set(["block", "hook", "ui"]).has(value)) {
          return { ...parsed, error: "--type must be one of: ui, block, hook." };
        }
        parsed.type = value as UiRegistrySearchArgs["type"];
      }
      if (token === "--limit" || token === "--offset") {
        const numericValue = Number(value);
        const maximum = token === "--limit" ? 100 : 10_000;
        const minimum = token === "--limit" ? 1 : 0;
        if (!Number.isSafeInteger(numericValue) || numericValue < minimum || numericValue > maximum) {
          return { ...parsed, error: `${token} must be an integer between ${minimum} and ${maximum}.` };
        }
        if (token === "--limit") parsed.limit = numericValue;
        if (token === "--offset") parsed.offset = numericValue;
      }
      index += 1;
      continue;
    }
    return { ...parsed, error: `Unsupported option: ${token}` };
  }

  if (!parsed.help && parsed.source === undefined) {
    return { ...parsed, error: "Select an explicit registry with --source shadcn|magicui|aceternity." };
  }
  return parsed;
}

export function qualifyRegistryItems(source: UiRegistrySource, components: string[]): string[] {
  if (source === "shadcn") return components;
  return components.map((component) => `${uiRegistryPolicies[source].namespace}/${component}`);
}

export function buildUiRegistryAddCliArgs({
  components,
  diff,
  dryRun,
  overwrite,
  source,
  view,
  workspaceRoot,
}: Pick<UiRegistryAddArgs, "components" | "diff" | "dryRun" | "overwrite" | "source" | "view"> & {
  workspaceRoot: string;
}): string[] {
  if (source === undefined) throw new Error("A registry source is required.");
  const shadcnWorkspacePath = join(workspaceRoot, shadcnWorkspaceDirectory);

  return [
    "add",
    ...qualifyRegistryItems(source, components),
    "--yes",
    "--cwd",
    shadcnWorkspacePath,
    "--path",
    shadcnComponentDirectory,
    ...(dryRun ? ["--dry-run"] : []),
    ...(overwrite ? ["--overwrite"] : []),
    ...(view ? ["--view"] : []),
    ...(diff ? ["--diff"] : []),
  ];
}

export function buildUiRegistrySearchCliArgs({
  limit,
  offset,
  query,
  source,
  type,
  workspaceRoot,
}: UiRegistrySearchArgs & { workspaceRoot: string }): string[] {
  if (source === undefined) throw new Error("A registry source is required.");
  return [
    "search",
    uiRegistryPolicies[source].namespace,
    "--cwd",
    join(workspaceRoot, shadcnWorkspaceDirectory),
    "--limit",
    String(limit),
    "--offset",
    String(offset),
    ...(query === undefined ? [] : ["--query", query]),
    ...(type === undefined ? [] : ["--type", type]),
  ];
}

export function shadcnExecutablePath(workspaceRoot: string): string {
  return join(workspaceRoot, "node_modules", ".bin", process.platform === "win32" ? "shadcn.cmd" : "shadcn");
}

export function findExistingRegistryItem(
  workspaceRoot: string,
  components: string[],
  pathExists: (path: string) => boolean = existsSync,
): string | undefined {
  for (const component of components) {
    for (const suffix of [".tsx", ".ts", "/index.tsx", "/index.ts"] as const) {
      const candidate = join(workspaceRoot, shadcnSharedUiSourceDirectory, `${component}${suffix}`);
      if (pathExists(candidate)) return candidate;
    }
  }
  return undefined;
}

export function validateRegistryDryRunOutput(output: string, allowComponentUpdates = false): string[] {
  const plainOutput = output.replaceAll(/\u001b\[[0-9;]*m/gu, "");
  const summaryFilePattern = /^[\s│├└]*[+~!-]\s+(\S+)\s+(create|delete|overwrite|update)\s*$/gmu;
  const viewedFilePattern = /^[\s│]*[├└]\s+(\S+)\s+\((create|delete|overwrite|update)\)(?:\s|$)/gmu;
  const targets = [summaryFilePattern, viewedFilePattern].flatMap((pattern) =>
    [...plainOutput.matchAll(pattern)]
      .map((match) => ({ action: match[2], path: match[1] }))
      .filter((target): target is { action: string; path: string } => Boolean(target.action && target.path)),
  );
  if (targets.length === 0) {
    return ["The shadcn dry-run did not expose file targets; refusing to apply with an unverifiable write set."];
  }

  const allowedFiles = new Set(["package.json", "ui-web/lib/src/styles.css"]);
  return targets.flatMap(({ action, path }) => {
    const normalizedPath = path.replaceAll("\\", "/");
    const isCanonicalPath =
      normalizedPath === posix.normalize(normalizedPath) &&
      !posix.isAbsolute(normalizedPath) &&
      (normalizedPath.startsWith(`${shadcnComponentDirectory}/`) || allowedFiles.has(normalizedPath));
    if (!isCanonicalPath) {
      return [`Registry item targets ${path}; only ${shadcnComponentDirectory}/**, ui-web/lib/src/styles.css, and the frontend package manifest are allowed.`];
    }
    if (action === "delete") return [`Registry item attempts to delete ${path}; registry imports may not delete repository files.`];
    if (
      normalizedPath.startsWith(`${shadcnComponentDirectory}/`) &&
      (action === "overwrite" || action === "update") &&
      !allowComponentUpdates
    ) {
      return [`Registry item would ${action} existing shared source at ${path}; rerun only after deliberate review with --apply --overwrite.`];
    }
    return [];
  });
}

type ShadcnRunner = typeof run;

export function runUiRegistryAddCommand(
  context: CommandContext,
  commandRunner: ShadcnRunner = run,
  executableExists: (path: string) => boolean = existsSync,
  pathExists: (path: string) => boolean = existsSync,
  defaultSource?: UiRegistrySource,
): number {
  const parsed = parseUiRegistryAddArgs(context.argv, defaultSource);

  if (parsed.help) {
    printAddHelp(defaultSource);
    return 0;
  }
  if (parsed.error !== undefined || parsed.source === undefined) {
    console.error(parsed.error ?? "A registry source is required.");
    printAddHelp(defaultSource);
    return 1;
  }

  const executable = shadcnExecutablePath(context.workspaceRoot);
  if (!executableExists(executable)) {
    console.error("The pinned shadcn CLI is unavailable. Run pnpm install --frozen-lockfile before using this command.");
    return 1;
  }

  if (parsed.dryRun) {
    console.log(`Previewing ${parsed.source} source only (${uiRegistryPolicies[parsed.source].license}). Pass --apply only after reviewing source, dependencies, CSS, assets, accessibility, and license.`);
    if (!uiRegistryPolicies[parsed.source].apply) console.warn(uiRegistryPolicies[parsed.source].note);
    return commandRunner(
      executable,
      buildUiRegistryAddCliArgs({ ...parsed, workspaceRoot: context.workspaceRoot }),
      { cwd: join(context.workspaceRoot, shadcnWorkspaceDirectory), stdio: "inherit" },
    ).status;
  }

  if (!parsed.overwrite) {
    const existing = findExistingRegistryItem(context.workspaceRoot, parsed.components, pathExists);
    if (existing !== undefined) {
      console.error(`Refusing to create a duplicate shared component: ${existing}. Review the existing owner or use --overwrite deliberately.`);
      return 1;
    }
  }

  const preflightArgs = buildUiRegistryAddCliArgs({
    ...parsed,
    diff: false,
    dryRun: true,
    view: true,
    workspaceRoot: context.workspaceRoot,
  });
  const preflight = commandRunner(executable, preflightArgs, {
    cwd: join(context.workspaceRoot, shadcnWorkspaceDirectory),
    env: { FORCE_COLOR: "0", NO_COLOR: "1" },
    stdio: "pipe",
  });
  process.stdout.write(preflight.stdout);
  process.stderr.write(preflight.stderr);
  if (preflight.status !== 0) return preflight.status;

  const unsafeTargets = validateRegistryDryRunOutput(`${preflight.stdout}\n${preflight.stderr}`, parsed.overwrite);
  if (unsafeTargets.length > 0) {
    for (const error of unsafeTargets) console.error(error);
    return 1;
  }

  console.log(`Applying reviewed ${parsed.source} source only to ${shadcnSharedUiSourceDirectory}.`);
  const result: RunResult = commandRunner(
    executable,
    buildUiRegistryAddCliArgs({ ...parsed, workspaceRoot: context.workspaceRoot }),
    { cwd: join(context.workspaceRoot, shadcnWorkspaceDirectory), stdio: "inherit" },
  );
  return result.status;
}

export function runShadcnAddCommand(
  context: CommandContext,
  commandRunner: ShadcnRunner = run,
  executableExists: (path: string) => boolean = existsSync,
  pathExists: (path: string) => boolean = existsSync,
): number {
  return runUiRegistryAddCommand(context, commandRunner, executableExists, pathExists, "shadcn");
}

export function runUiRegistrySearchCommand(
  context: CommandContext,
  commandRunner: ShadcnRunner = run,
  executableExists: (path: string) => boolean = existsSync,
): number {
  const parsed = parseUiRegistrySearchArgs(context.argv);
  if (parsed.help) {
    printSearchHelp();
    return 0;
  }
  if (parsed.error !== undefined || parsed.source === undefined) {
    console.error(parsed.error ?? "A registry source is required.");
    printSearchHelp();
    return 1;
  }
  const executable = shadcnExecutablePath(context.workspaceRoot);
  if (!executableExists(executable)) {
    console.error("The pinned shadcn CLI is unavailable. Run pnpm install --frozen-lockfile before using this command.");
    return 1;
  }
  console.log(`${parsed.source}: ${uiRegistryPolicies[parsed.source].note} Apply policy: ${uiRegistryPolicies[parsed.source].apply ? "reviewed source allowed" : "preview only"}.`);
  return commandRunner(
    executable,
    buildUiRegistrySearchCliArgs({ ...parsed, workspaceRoot: context.workspaceRoot }),
    { cwd: join(context.workspaceRoot, shadcnWorkspaceDirectory), stdio: "inherit" },
  ).status;
}

function printAddHelp(defaultSource?: UiRegistrySource): void {
  const sourceOption = defaultSource === undefined ? " --source shadcn|magicui|aceternity" : "";
  console.log(`Usage: pnpm run ${defaultSource === "shadcn" ? "ui:shadcn:add" : "ui:registry:add"} --${sourceOption} <item...> [--view|--diff] [--apply] [--overwrite]`);
  console.log();
  console.log(`Source is always targeted at ${shadcnSharedUiSourceDirectory}; arbitrary URLs, paths, options, and paid namespaces are rejected.`);
  console.log("shadcn is the canonical primitive source; Magic UI is optional MIT creative source; Aceternity is non-persistent research preview only and is never distributed by this template.");
}

function printSearchHelp(): void {
  console.log("Usage: pnpm run ui:registry:search -- --source shadcn|magicui|aceternity [--query text] [--type ui|block|hook] [--limit 1-100] [--offset n]");
}
