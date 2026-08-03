// Evidence for: REQ-ASSURANCE-TRACE-001
import { existsSync } from "node:fs";
// Mutation evidence for REQ-ASSURANCE-TRACE-001.
import { resolve } from "node:path";
import { parseArgs } from "../../runtime/args";
import { writeJson } from "../../runtime/files";
import {
  commandExists,
  run,
  type RunOptions,
  type RunResult,
} from "../../runtime/process";

export interface MutationOptions {
  argv?: string[];
  workspaceRoot?: string;
  runtime?: {
    commandExists(program: string): boolean;
    run(program: string, args: string[], options: RunOptions): RunResult;
  };
}

interface ProjectScope {
  mutate: string;
  testCommand: string;
}

/**
 * Negative mutate patterns that must mirror `stryker.config.mjs`. Stryker's CLI
 * override replaces the config's `mutate` array rather than merging into it, so
 * any scoped run has to restate them or it will mutate test files.
 */
export const mutateExclusions = [
  "!**/*.spec.ts",
  "!**/*.spec.tsx",
  "!**/*.e2e-spec.ts",
  "!**/*.component-spec.ts",
  "!**/generated/**",
  "!**/migrations/**",
] as const;

/**
 * Resolves a mutation scope from the Nx graph so callers name a project instead
 * of a glob. Without this, the config's workspace-wide `apps/**` + `libs/**`
 * mutate set runs the *entire* workspace test suite once per mutant — over a
 * thousand source files against a multi-minute suite, which cannot finish inside
 * any CI timeout. Reading the graph keeps selection generic: no project list
 * lives in the config, the workflow, or this file.
 */
function resolveProjectScope(
  project: string,
  workspaceRoot: string,
  runtime: NonNullable<MutationOptions["runtime"]>,
): ProjectScope | null {
  const shown = runtime.run("pnpm", ["exec", "nx", "show", "project", project, "--json"], {
    cwd: workspaceRoot,
  });

  if (shown.status !== 0) {
    console.error(`Unable to read Nx project "${project}".`);
    return null;
  }

  let definition: { root?: string; sourceRoot?: string; targets?: Record<string, unknown> };
  try {
    definition = JSON.parse(shown.stdout) as typeof definition;
  } catch {
    console.error(`Nx returned an unreadable project definition for "${project}".`);
    return null;
  }

  const sourceRoot = definition.sourceRoot ?? definition.root;
  if (!sourceRoot) {
    console.error(`Nx project "${project}" declares neither sourceRoot nor root.`);
    return null;
  }

  if (!definition.targets || !("test" in definition.targets)) {
    console.error(`Nx project "${project}" has no test target to measure mutants against.`);
    return null;
  }

  return {
    // The exclusions must be repeated here. Stryker deep-merges the CLI over the
    // config file, and its merge REPLACES arrays wholesale, so a bare
    // `--mutate <globs>` drops every negative pattern from stryker.config.mjs
    // and starts mutating spec files. mutation.test.ts asserts these stay in
    // step with the config.
    mutate: [`${sourceRoot}/**/*.ts`, `${sourceRoot}/**/*.tsx`, ...mutateExclusions].join(","),
    testCommand: `pnpm exec nx run ${project}:test --skip-nx-cache`,
  };
}

/**
 * Lists projects carrying an Nx tag and a `test` target. Selection stays by tag
 * so no project list is embedded in a script, config, or workflow.
 */
function resolveTaggedProjects(
  tag: string,
  workspaceRoot: string,
  runtime: NonNullable<MutationOptions["runtime"]>,
): string[] | null {
  const listed = runtime.run(
    "pnpm",
    ["exec", "nx", "show", "projects", "--with-target", "test", "--projects", `tag:${tag}`, "--json"],
    { cwd: workspaceRoot },
  );

  if (listed.status !== 0) {
    console.error(`Unable to list Nx projects for tag "${tag}".`);
    return null;
  }

  try {
    const projects = JSON.parse(listed.stdout) as unknown;
    return Array.isArray(projects) ? projects.filter((entry): entry is string => typeof entry === "string") : null;
  } catch {
    console.error(`Nx returned an unreadable project list for tag "${tag}".`);
    return null;
  }
}

export function runMutation(options: MutationOptions = {}): number {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const runtime = options.runtime ?? { commandExists, run };
  const args = parseArgs(options.argv ?? []);
  const config =
    args.options.get("config") ??
    process.env.STRYKER_CONFIG ??
    "stryker.config.mjs";
  const reportPath =
    args.options.get("report") ?? "test-results/mutation/command.json";
  // `--no-tag` suppresses the STRYKER_TAG fallback on re-entry. Without it a tag
  // set through the environment made every per-project call re-enter the tag
  // branch and recurse forever instead of ever mutating a project.
  const tag = args.flags.has("no-tag") ? undefined : (args.options.get("tag") ?? process.env.STRYKER_TAG);
  if (tag) {
    const tagged = resolveTaggedProjects(tag, workspaceRoot, runtime);
    if (!tagged) {
      return 1;
    }
    if (tagged.length === 0) {
      console.error(`No Nx project with a test target carries the tag "${tag}".`);
      return 1;
    }

    // Bounded on purpose: the command runner re-runs a project's whole suite per
    // mutant, so an unbounded sweep silently outgrows any CI budget.
    const limit = Number(args.options.get("max-projects") ?? process.env.STRYKER_MAX_PROJECTS ?? "3");
    const selected = tagged.slice().sort().slice(0, Number.isFinite(limit) && limit > 0 ? limit : 3);
    if (selected.length < tagged.length) {
      console.warn(
        `Mutating ${selected.length} of ${tagged.length} projects tagged "${tag}" (--max-projects). Skipped: ${tagged
          .filter((entry) => !selected.includes(entry))
          .join(", ")}`,
      );
    }

    for (const taggedProject of selected) {
      const status = runMutation({
        ...options,
        argv: [
          "--no-tag",
          "--project",
          taggedProject,
          "--report",
          `test-results/mutation/${taggedProject.replaceAll("/", "-").replace(/^@/u, "")}.json`,
          "--config",
          config,
          // Forwarded so `--tag ... --dry-run` stays non-executing.
          ...(args.flags.has("dry-run") ? ["--dry-run"] : []),
        ],
      });
      if (status !== 0) {
        return status;
      }
    }

    return 0;
  }

  const project = args.options.get("project") ?? process.env.STRYKER_PROJECT;
  const scope = project ? resolveProjectScope(project, workspaceRoot, runtime) : null;

  if (project && !scope) {
    return 1;
  }

  if (scope) {
    process.env.STRYKER_TEST_COMMAND = scope.testCommand;
  }

  const mutate = args.options.get("mutate") ?? process.env.STRYKER_MUTATE ?? scope?.mutate;
  const strykerCli =
    "packages/tooling/node_modules/@stryker-mutator/core/bin/stryker.js";
  const command = [
    strykerCli,
    "run",
    config,
    ...(mutate ? ["--mutate", mutate] : []),
    ...args.positional,
  ];
  const configPath = resolve(workspaceRoot, config);
  const reportAbsolutePath = resolve(workspaceRoot, reportPath);

  if (!existsSync(configPath)) {
    console.error(`Stryker config not found: ${config}`);
    return 1;
  }

  if (args.flags.has("dry-run")) {
    const report = { status: "dry-run", command: ["node", ...command], config };
    writeJson(reportAbsolutePath, report);
    console.log(JSON.stringify({ ...report, report: reportPath }, null, 2));
    return 0;
  }

  // An unscoped run mutates every file under apps/ and libs/ and re-runs the
  // whole workspace suite per mutant, which never completes. Keep it reachable
  // for a deliberate long run, but never as the default. Checked after --dry-run
  // so the plan stays inspectable.
  if (!mutate && !args.flags.has("all")) {
    console.error(
      "Mutation testing needs a scope. Pass --project <nx-project> (recommended), --mutate <glob>, or --all for a deliberate workspace-wide run.",
    );
    return 1;
  }

  if (!runtime.commandExists("node")) {
    console.error("Node.js is required to run the repository-pinned Stryker.");
    return 1;
  }

  writeJson(reportAbsolutePath, {
    status: "running",
    command: ["node", ...command],
    config,
  });
  const result = runtime.run("node", command, {
    cwd: workspaceRoot,
    stdio: "inherit",
  });
  writeJson(reportAbsolutePath, {
    status: result.status === 0 ? "ok" : "failed",
    command: ["node", ...command],
    config,
    exitCode: result.status,
  });

  return result.status;
}
