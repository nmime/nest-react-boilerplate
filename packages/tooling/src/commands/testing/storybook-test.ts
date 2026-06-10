import { spawn } from "node:child_process";

const child = spawn(
  process.platform === "win32" ? "pnpm.cmd" : "pnpm",
  ["exec", "vitest", "run", "--config", "vitest.storybook.config.mts"],
  { cwd: "libs/frontend/ui/lib", stdio: "inherit" },
);

const exitCode = await new Promise<number>((resolveExit, rejectExit) => {
  child.once("error", rejectExit);
  child.once("exit", (code) => resolveExit(code ?? 1));
});

process.exit(exitCode);
