// Evidence for: REQ-SCAFFOLD-QUALITY-006
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "../../runtime/args";
import { writeJson } from "../../runtime/files";
import { run, type RunOptions, type RunResult } from "../../runtime/process";

/**
 * Byte budgets for the built frontend apps. The performance gate only measured
 * TTFB and the HTML document, so a single-chunk 1.1 MB SPA bundle passed it
 * unnoticed. Budgets are keyed by Nx project so app selection stays graph-driven
 * rather than a hardcoded list in this file.
 */
export interface BundleBudget {
  /** Largest single JavaScript chunk, in bytes. Guards against un-split bundles. */
  maxChunkBytes: number;
  /** Total JavaScript shipped for a cold load, in bytes. */
  maxJavaScriptBytes: number;
  /** Total CSS shipped for a cold load, in bytes. */
  maxCssBytes: number;
}

export interface BundleBudgetFile {
  /** Applies when a project has no explicit entry. */
  default: BundleBudget;
  projects: Record<string, Partial<BundleBudget>>;
}

interface AppOutput {
  project: string;
  outputPath: string;
}

interface AppMeasurement extends AppOutput {
  budget: BundleBudget;
  javaScriptBytes: number;
  cssBytes: number;
  largestChunk: { path: string; bytes: number } | null;
  fileCount: number;
  violations: string[];
}

export interface BundleBudgetOptions {
  argv?: string[];
  workspaceRoot?: string;
  runtime?: {
    run(program: string, args: string[], options: RunOptions): RunResult;
  };
}

const collectFiles = (directory: string, extensions: readonly string[]): string[] => {
  const found: string[] = [];

  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const entryPath = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }
      if (extensions.some((extension) => entry.name.endsWith(extension))) {
        found.push(entryPath);
      }
    }
  };

  walk(directory);
  return found;
};

/**
 * Resolves every frontend app and its build output from the Nx graph. Selection
 * is by tag so a new app is covered the moment it is scaffolded.
 *
 * The output directory comes from the build target's declared `outputs`, not from
 * `dist/<projectRoot>`: `mobile-app` is tagged `type:frontend-app` but its build
 * target is `tsc --noEmit` with `outputs: []` (a separate `export` target emits
 * the Expo web bundle), so guessing the path made the gate demand a directory
 * that a normal build never produces.
 */
export function resolveFrontendApps(
  workspaceRoot: string,
  runtime: NonNullable<BundleBudgetOptions["runtime"]>,
  tag: string,
): AppOutput[] | null {
  const listed = runtime.run(
    "pnpm",
    ["exec", "nx", "show", "projects", "--projects", `tag:${tag}`, "--json"],
    { cwd: workspaceRoot },
  );

  if (listed.status !== 0) {
    console.error(`Unable to list Nx projects for tag "${tag}".`);
    return null;
  }

  let projects: string[];
  try {
    const parsed = JSON.parse(listed.stdout) as unknown;
    projects = Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    console.error(`Nx returned an unreadable project list for tag "${tag}".`);
    return null;
  }

  const outputs: AppOutput[] = [];
  for (const project of projects) {
    const shown = runtime.run("pnpm", ["exec", "nx", "show", "project", project, "--json"], {
      cwd: workspaceRoot,
    });
    if (shown.status !== 0) {
      console.error(`Unable to read Nx project "${project}".`);
      return null;
    }

    let definition: { root?: string; targets?: Record<string, { outputs?: string[] }> };
    try {
      definition = JSON.parse(shown.stdout) as typeof definition;
    } catch {
      console.error(`Nx returned an unreadable project definition for "${project}".`);
      return null;
    }

    if (!definition.root) {
      console.error(`Nx project "${project}" declares no root.`);
      return null;
    }

    const declared = definition.targets?.["build"]?.outputs ?? [];
    const buildOutputs = declared
      .filter((output) => output.includes("{workspaceRoot}"))
      .map((output) => output.replace("{workspaceRoot}/", "").replace("{workspaceRoot}", "."));

    if (buildOutputs.length === 0) {
      // Not an error: the project genuinely has no bundle for this gate to weigh.
      console.log(`- ${project}: build target declares no workspace outputs; not a measurable bundle.`);
      continue;
    }

    for (const outputPath of buildOutputs) {
      outputs.push({ project, outputPath });
    }
  }

  return outputs;
}

const measure = (
  app: AppOutput,
  workspaceRoot: string,
  budgets: BundleBudgetFile,
): AppMeasurement | { project: string; missing: string } => {
  const absolute = resolve(workspaceRoot, app.outputPath);
  if (!existsSync(absolute)) {
    return { project: app.project, missing: app.outputPath };
  }

  const budget: BundleBudget = { ...budgets.default, ...(budgets.projects[app.project] ?? {}) };
  const scripts = collectFiles(absolute, [".js", ".mjs"]);
  const styles = collectFiles(absolute, [".css"]);

  let javaScriptBytes = 0;
  let largestChunk: AppMeasurement["largestChunk"] = null;
  for (const script of scripts) {
    const bytes = statSync(script).size;
    javaScriptBytes += bytes;
    if (!largestChunk || bytes > largestChunk.bytes) {
      largestChunk = { bytes, path: script.slice(absolute.length + 1) };
    }
  }

  const cssBytes = styles.reduce((total, style) => total + statSync(style).size, 0);

  const violations: string[] = [];
  if (javaScriptBytes > budget.maxJavaScriptBytes) {
    violations.push(`total JavaScript ${javaScriptBytes}B exceeds ${budget.maxJavaScriptBytes}B`);
  }
  if (cssBytes > budget.maxCssBytes) {
    violations.push(`total CSS ${cssBytes}B exceeds ${budget.maxCssBytes}B`);
  }
  if (largestChunk && largestChunk.bytes > budget.maxChunkBytes) {
    violations.push(
      `largest chunk ${largestChunk.path} is ${largestChunk.bytes}B, over the ${budget.maxChunkBytes}B single-chunk budget — split the route or vendor code`,
    );
  }

  return {
    ...app,
    budget,
    cssBytes,
    fileCount: scripts.length + styles.length,
    javaScriptBytes,
    largestChunk,
    violations,
  };
};

export function runBundleBudget(options: BundleBudgetOptions = {}): number {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const runtime = options.runtime ?? { run };
  const args = parseArgs(options.argv ?? []);
  const tag = args.options.get("tag") ?? "type:frontend-app";
  const budgetPath =
    args.options.get("budgets") ?? "packages/tooling/config/frontend-bundle-budgets.json";
  const reportPath = args.options.get("report") ?? "test-results/bundle-budget/report.json";
  const reportAbsolutePath = resolve(workspaceRoot, reportPath);

  const budgets = JSON.parse(readFileSync(resolve(workspaceRoot, budgetPath), "utf8")) as BundleBudgetFile;
  const apps = resolveFrontendApps(workspaceRoot, runtime, tag);
  if (!apps) {
    return 1;
  }

  const measured = apps.map((app) => measure(app, workspaceRoot, budgets));
  const missing = measured.filter((entry): entry is { project: string; missing: string } => "missing" in entry);
  const results = measured.filter((entry): entry is AppMeasurement => !("missing" in entry));
  const violations = results.filter((result) => result.violations.length > 0);

  writeJson(reportAbsolutePath, {
    budgets: budgetPath,
    missing,
    results,
    status: violations.length > 0 ? "violations" : "ok",
    tag,
  });

  for (const result of results) {
    const summary = `${result.project}: js=${result.javaScriptBytes}B css=${result.cssBytes}B largest=${result.largestChunk?.bytes ?? 0}B files=${result.fileCount}`;
    if (result.violations.length > 0) {
      console.error(`✗ ${summary}`);
      for (const violation of result.violations) {
        console.error(`    ${violation}`);
      }
    } else {
      console.log(`✓ ${summary}`);
    }
  }

  // A build that never ran must not read as a pass. `--skip-missing` exists for
  // the affected-only PR lane, where an app that was not rebuilt cannot have
  // changed its bundle; it still reports what it skipped rather than going quiet.
  if (missing.length > 0) {
    const skipMissing = args.flags.has("skip-missing");
    for (const entry of missing) {
      const message = `${entry.project}: no build output at ${entry.missing}`;
      if (skipMissing) {
        console.warn(`- ${message} (skipped, not rebuilt in this run)`);
      } else {
        console.error(`✗ ${message}. Run the app build first.`);
      }
    }
    if (!skipMissing) {
      return 1;
    }
  }

  // On an affected-only PR lane a backend-only change rebuilds no frontend at
  // all, so "nothing measured" is the correct outcome there rather than a
  // failure. Without --skip-missing it still means the caller forgot to build.
  if (results.length === 0) {
    if (args.flags.has("skip-missing")) {
      console.log(`No frontend app was rebuilt in this run; nothing to weigh against the bundle budgets.`);
      return 0;
    }
    console.error(
      `No frontend app was measured for tag "${tag}". Either no project carries it, or nothing was built.`,
    );
    return 1;
  }

  console.log(
    JSON.stringify({
      apps: results.length,
      report: reportPath,
      status: violations.length > 0 ? "violations" : "ok",
    }),
  );

  return violations.length > 0 ? 1 : 0;
}
