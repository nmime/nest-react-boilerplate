/**
 * Mockable Nx generator runner for the `pnpm nrb add` command.
 *
 * By default invokes the workspace-local `nx generate`. Tests can replace the factory
 * to inject a stubbed runner that records calls without hitting the
 * filesystem.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChildProcessExecError {
  status?: number | null;
  stdout?: string | null;
  stderr?: string | null;
}

export interface NxGeneratorResult {
  /** Whether the generator process exited successfully. */
  success: boolean;
  /** stdout (truncated to a bounded diagnostic payload). */
  stdout: string;
  /** stderr (truncated to a bounded diagnostic payload). */
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
  const nxBin = join(cwd, "node_modules", ".bin", process.platform === "win32" ? "nx.cmd" : "nx");
  try {
    const output = execFileSync(nxBin, ["generate", collectionGenerator, ...generatorArgs], {
      encoding: "utf8",
      cwd,
      timeout: 120000,
    });
    return {
      success: true,
      stdout: truncate(output, 65536),
      stderr: "",
      exitCode: 0,
    };
  } catch (err: unknown) {
    const status = err instanceof Error && "status" in err ? (err as ChildProcessExecError).status : 1;
    const stdout = err instanceof Error && "stdout" in err ? String((err as ChildProcessExecError).stdout ?? "") : "";
    const stderr = err instanceof Error && "stderr" in err ? String((err as ChildProcessExecError).stderr ?? "") : String(err);
    return {
      success: false,
      stdout: truncate(stdout, 65536),
      stderr: truncate(stderr, 65536),
      exitCode: typeof status === "number" ? status : 1,
    };
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "\n… (truncated)" : s;
}
