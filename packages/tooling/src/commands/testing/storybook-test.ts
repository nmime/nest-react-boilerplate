import { spawn } from "node:child_process";
import { join, resolve } from "node:path";

const workspaceRoot = resolve(import.meta.dirname, "../../../../..");
const storybookRoot = join(workspaceRoot, "libs/frontend/ui-web/lib");
const vitestBin =
  process.platform === "win32"
    ? join(workspaceRoot, "node_modules/.bin/vitest.cmd")
    : join(workspaceRoot, "node_modules/.bin/vitest");

const child = spawn(
  vitestBin,
  ["run", "--config", "vitest.storybook.config.mts"],
  { cwd: storybookRoot, stdio: "inherit" },
);

const exitCode = await new Promise<number>((resolveExit, rejectExit) => {
  child.once("error", rejectExit);
  child.once("exit", (code) => resolveExit(code ?? 1));
});

process.exit(exitCode);
