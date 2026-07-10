/**
 * Mockable Nx generator runner for the `nrb add` command.
 *
 * By default invokes `npx nx generate`.  Tests can replace the factory
 * to inject a stubbed runner that records calls without hitting the
 * filesystem.
 */
import { execFileSync } from "node:child_process";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NxGeneratorResult {
  /** Whether the generator process exited successfully. */
  success: boolean;
  /** stdout (truncated to 2 KB). */
  stdout: string;
  /** stderr (truncated to 2 KB). */
  stderr: string;
  /** Exit code from the process (0 = success). */
  exitCode: number;
}

export type NxGeneratorFn = (args: NxGeneratorArgs) => NxGeneratorResult;

export interface NxGeneratorArgs {
  /** The Nx collection and generator name, e.g. "@nx/node:app". */
  collectionGenerator: string;
  /** Positional arguments passed to the generator, e.g. ["--name=my-app"]. */
  generatorArgs: string[];
  /** Working directory (workspace root). */
  cwd: string;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create an Nx generator runner.
 *
 * - When `mock` is supplied, returns the mock function directly (for tests).
 * - When `mock` is not supplied, returns the real runner backed by
 *   `execFileSync("npx", ["nx", "generate", ...])`.
 */
export function createNxGeneratorRunner(
  mock?: NxGeneratorFn,
): NxGeneratorFn {
  if (mock !== undefined) return mock;
  return realNxGeneratorRunner;
}

function realNxGeneratorRunner(args: NxGeneratorArgs): NxGeneratorResult {
  const { collectionGenerator, generatorArgs, cwd } = args;
  try {
    const output = execFileSync("npx", ["nx", "generate", collectionGenerator, ...generatorArgs], {
      encoding: "utf8",
      cwd,
      timeout: 120000,
    });
    return {
      success: true,
      stdout: truncate(output, 2048),
      stderr: "",
      exitCode: 0,
    };
  } catch (err: any) {
    return {
      success: false,
      stdout: truncate(err.stdout ?? "", 2048),
      stderr: truncate(err.stderr ?? String(err), 2048),
      exitCode: err.status ?? 1,
    };
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "\n… (truncated)" : s;
}
