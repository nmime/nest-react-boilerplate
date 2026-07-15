import type { CommandContext } from "../../cli.js";
import { runAddCommand } from "./add.js";
import { createNxGeneratorRunner, type NxGeneratorFn } from "./nx-generator-runner.js";

interface GenerateVerticalSliceOptions {
  workspaceRoot: string;
  argv: string[];
  runner?: NxGeneratorFn;
}

/** Compatibility entrypoint that delegates to the feature generator. */
export async function runGenerateVerticalSlice(
  options: GenerateVerticalSliceOptions,
): Promise<number> {
  process.stderr.write(
    "Deprecated: use `pnpm nrb add feature <name> --api-app <api> --frontend-app <app>`; delegating to the feature generator.\n",
  );

  const context: CommandContext = {
    argv: ["feature", ...options.argv],
    packageRoot: `${options.workspaceRoot}/packages/tooling`,
    workspaceRoot: options.workspaceRoot,
  };

  return runAddCommand(context, options.runner ?? createNxGeneratorRunner());
}

export async function runGenerateVerticalSliceFromContext(
  context: CommandContext,
): Promise<number> {
  return runGenerateVerticalSlice({
    argv: context.argv,
    workspaceRoot: context.workspaceRoot,
  });
}
