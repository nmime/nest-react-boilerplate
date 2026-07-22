#!/usr/bin/env node
import { spawn, type SpawnOptions } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

interface WorkspaceManifest {
  apps?: unknown;
  capabilities?: unknown;
}

export interface FullstackSelection {
  projects: string[];
  capabilities: string[];
  source: "setup";
}

export function resolveFullstackSelection(workspaceRoot: string): FullstackSelection {
  const manifestPath = join(workspaceRoot, ".nrb", "workspace.json");
  if (!existsSync(manifestPath)) {
    throw new Error(
      "No application selection found. Run `pnpm nrb setup` and choose the frontend/backend apps this workspace needs.",
    );
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as WorkspaceManifest;
  const projects = Array.isArray(manifest.apps)
    ? manifest.apps.filter((value): value is string => typeof value === "string" && !value.endsWith("-e2e"))
    : [];
  const capabilities = Array.isArray(manifest.capabilities)
    ? manifest.capabilities.filter((value): value is string => typeof value === "string")
    : [];

  if (projects.length === 0) {
    throw new Error(
      ".nrb/workspace.json selects no runnable applications; rerun `pnpm nrb setup` and select at least one app.",
    );
  }
  return { projects, capabilities, source: "setup" };
}

const env = {
  ...process.env,
  AUTH_PERSISTENCE: process.env.AUTH_PERSISTENCE ?? "postgres",
  SESSION_SECRET: process.env.SESSION_SECRET ?? "local-dev-session-secret-change-me",
  DATABASE_URL: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/nest_react_boilerplate",
  VITE_AUTH_API_BASE_URL: process.env.VITE_AUTH_API_BASE_URL ?? "http://localhost:3003",
  VITE_USER_API_BASE_URL: process.env.VITE_USER_API_BASE_URL ?? "http://localhost:3002",
  VITE_ADMIN_API_BASE_URL: process.env.VITE_ADMIN_API_BASE_URL ?? "http://localhost:3001",
};

const run = (command: string, args: string[], options: SpawnOptions = {}) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      env,
      ...options,
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} exited with ${code}`)),
    );
  });

export async function runFullstack(workspaceRoot = process.cwd()): Promise<void> {
  const selection = resolveFullstackSelection(workspaceRoot);
  if (selection.capabilities.includes("postgres")) {
    await run("docker", ["compose", "up", "-d", "postgres"], { cwd: workspaceRoot });
    await run("node", ["packages/tooling/bin/repo-tooling.mjs", "db", "migrate"], { cwd: workspaceRoot });
  }

  console.log(`Starting ${selection.projects.join(", ")} (.nrb/workspace.json selection).`);
  await run(
    "pnpm",
    [
      "exec",
      "nx",
      "run-many",
      "-t",
      "serve",
      `--projects=${selection.projects.join(",")}`,
      `--parallel=${selection.projects.length}`,
    ],
    { cwd: workspaceRoot },
  );
}

const invokedDirectly = process.argv[1]?.endsWith("fullstack.ts") || process.argv[1]?.endsWith("fullstack.js");
if (invokedDirectly) {
  await runFullstack();
}
