#!/usr/bin/env node
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { openApiContractByName } from "./contracts-manifest.ts";

function parseArgs(argv: string[]) {
  const authContract = openApiContractByName("auth-app-api");
  const args = {
    app: authContract.app,
    output: authContract.artifactPath,
    port: "3999",
    dryRun: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--") continue;
    const val = () => {
      const next = argv[++i];
      if (!next) throw new Error(`${item} requires a value.`);
      return next;
    };
    if (item === "--app") args.app = val();
    else if (item === "--output") args.output = val();
    else if (item === "--port") args.port = val();
    else if (item === "--dry-run") args.dryRun = true;
    else if (item === "--help" || item === "-h") args.help = true;
    else throw new Error(`Unknown option: ${item}`);
  }
  return args;
}
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function signalChild(child: ChildProcess, signal: NodeJS.Signals): void {
  try {
    if (process.platform !== "win32" && child.pid) {
      process.kill(-child.pid, signal);
      return;
    }

    child.kill(signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;

  signalChild(child, "SIGTERM");
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    await wait(100);
  }

  signalChild(child, "SIGKILL");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      "Usage: repo-tooling api openapi [--app auth-app-api] [--output apps/backend/auth/auth-app-api/contracts/openapi/auth-app-api.json] [--dry-run]",
    );
    return;
  }
  const env = {
    ...process.env,
    OPENAPI_ENABLED: "true",
    OPENAPI_PATH: "docs",
    AUTH_PERSISTENCE: "memory",
    SESSION_SECRET: process.env.SESSION_SECRET ?? "openapi-export-session-secret-only",
    AUTH_OAUTH_ENABLED: "false",
    PORT: args.port,
  };
  // Nx content hashes already invalidate changed application and dependency
  // builds. Reusing valid cache entries keeps contract export practical in a
  // large workspace while still rebuilding every changed source.
  const command = ["pnpm", "exec", "nx", "serve", args.app];
  const url = `http://127.0.0.1:${args.port}/docs/openapi.json`;
  if (args.dryRun) {
    console.log(JSON.stringify({ status: "dry-run", command, url, output: args.output }, null, 2));
    return;
  }
  const child = spawn(command[0], command.slice(1), {
    detached: process.platform !== "win32",
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout.on("data", (chunk) => {
    logs += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    logs += chunk.toString();
  });
  try {
    let body = "";
    // A clean Nx graph can legitimately need more than one minute to compile
    // all transitive projects before the API starts listening.
    for (let attempt = 0; attempt < 180; attempt += 1) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          body = await response.text();
          break;
        }
      } catch {}
      await wait(1000);
    }
    if (!body)
      throw new Error(
        `OpenAPI endpoint did not become ready. Logs:\n${logs.slice(-4000)}`,
      );
    mkdirSync(dirname(args.output), { recursive: true });
    writeFileSync(args.output, `${JSON.stringify(JSON.parse(body), null, 2)}\n`);
    console.log(JSON.stringify({ status: "exported", app: args.app, output: args.output }));
  } finally {
    await stopChild(child);
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
