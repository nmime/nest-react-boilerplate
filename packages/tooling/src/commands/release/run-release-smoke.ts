import { resolve } from "node:path";
import { EndpointManifestRelativePath } from "./endpoint-manifest.ts";
import { runReleaseSmoke } from "./release-smoke.ts";

export interface ReleaseSmokeCommandOptions {
  argv?: string[];
  workspaceRoot?: string;
}

export async function runReleaseSmokeCommand(
  options: ReleaseSmokeCommandOptions = {},
): Promise<number> {
  const workspaceRoot = resolve(options.workspaceRoot ?? process.cwd());
  const manifestArgument = readOption(options.argv ?? [], "--manifest");
  const manifestPath = resolve(
    workspaceRoot,
    manifestArgument ?? EndpointManifestRelativePath,
  );
  try {
    const result = await runReleaseSmoke({ manifestPath });
    process.stdout.write(`${JSON.stringify({ status: "ok", ...result })}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(
      `release smoke failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
}

function readOption(argv: string[], name: string): string | undefined {
  const prefix = `${name}=`;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index] ?? "";
    if (value.startsWith(prefix)) return value.slice(prefix.length);
    if (value === name) return argv[index + 1];
  }
  return undefined;
}

// Executed directly by `pnpm nrb release:smoke` (registerScript) with
// process.argv[2..] as command argv; imported lazily, never by tests.
process.exitCode = await runReleaseSmokeCommand({ argv: process.argv.slice(2) });
