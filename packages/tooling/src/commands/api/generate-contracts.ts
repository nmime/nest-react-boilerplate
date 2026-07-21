#!/usr/bin/env node
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  openApiContracts,
  type OpenApiContract,
} from "./contracts-manifest.ts";

interface GenerateContractsArgs {
  dryRun: boolean;
  contractsRoot?: string;
  typesRoot?: string;
  help?: boolean;
}

function parseArgs(argv: string[]): GenerateContractsArgs {
  const args: GenerateContractsArgs = { dryRun: false };

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--") continue;

    const value = () => {
      const next = argv[++index];
      if (!next) throw new Error(`${item} requires a value.`);
      return next;
    };

    if (item === "--contracts-root" || item === "--docs-root") {
      args.contractsRoot = value();
    } else if (item === "--types-root") {
      args.typesRoot = value();
    } else if (item === "--dry-run") {
      args.dryRun = true;
    } else if (item === "--help" || item === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown option: ${item}`);
    }
  }

  return args;
}

const wait = (ms: number) =>
  new Promise((resolveWait) => setTimeout(resolveWait, ms));

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function waitForChildExit(
  child: ChildProcess,
  timeoutMs: number,
): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(true);
  }

  return new Promise((resolveExit) => {
    const cleanup = () => {
      clearTimeout(timeout);
      child.off("exit", done);
      child.off("error", done);
    };
    const done = () => {
      cleanup();
      resolveExit(true);
    };
    const timeout = setTimeout(() => {
      cleanup();
      resolveExit(false);
    }, timeoutMs);

    child.once("exit", done);
    child.once("error", done);
  });
}

function signalChild(child: ChildProcess, signal: NodeJS.Signals): void {
  if (process.platform !== "win32" && child.pid !== undefined) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // Fall back to signaling the direct child when process-group signaling is unavailable.
    }
  }

  child.kill(signal);
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;

  signalChild(child, "SIGTERM");
  if (await waitForChildExit(child, 5000)) return;

  signalChild(child, "SIGKILL");
  await waitForChildExit(child, 5000);
}

async function fetchOpenApi({
  app,
  port,
  output,
}: {
  app: string;
  port: number;
  output: string;
}): Promise<void> {
  const env = {
    ...process.env,
    OPENAPI_ENABLED: "true",
    OPENAPI_PATH: "docs",
    AUTH_PERSISTENCE: "memory",
    AUTH_JWT_SECRET: process.env.AUTH_JWT_SECRET ?? "openapi-export-only",
    AUTH_OAUTH_ENABLED: "false",
    // Contract export uses the in-memory auth adapter and must not require a live database.
    DATABASE_URL: "",
    PORT: String(port),
  };
  // Nx's content-addressed cache remains correct for contract generation and
  // avoids recompiling the complete dependency graph for every API.
  const command = ["pnpm", "exec", "nx", "serve", app];
  const readyAttempts = readPositiveIntegerEnv("OPENAPI_READY_ATTEMPTS", 240);
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
    const url = `http://127.0.0.1:${port}/docs/openapi.json`;
    let body = "";

    for (let attempt = 0; attempt < readyAttempts; attempt += 1) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          body = await response.text();
          break;
        }
      } catch {
        // Retry until the app has finished booting.
      }

      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(
          `${app} exited before its OpenAPI endpoint became ready (exitCode=${String(child.exitCode)}, signal=${String(child.signalCode)}). Logs:\n${logs.slice(-4000)}`,
        );
      }

      await wait(1000);
    }

    if (!body) {
      throw new Error(
        `${app} OpenAPI endpoint did not become ready after ${readyAttempts} attempts. Logs:\n${logs.slice(
          -4000,
        )}`,
      );
    }

    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(JSON.parse(body), null, 2)}\n`);
  } finally {
    await stopChild(child);
  }
}

function generateTypes({ input, output }: { input: string; output: string }) {
  mkdirSync(dirname(output), { recursive: true });
  const result = spawnSync(
    "pnpm",
    ["exec", "openapi-typescript", input, "-o", output],
    { stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function format(paths: string[]) {
  const result = spawnSync(
    "pnpm",
    [
      "exec",
      "prettier",
      "--write",
      "--config",
      resolve(".prettierrc"),
      "--ignore-path",
      "/dev/null",
      ...paths.map((path) => resolve(path)),
    ],
    { stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function artifactOutput(
  contract: OpenApiContract,
  args: GenerateContractsArgs,
) {
  return args.contractsRoot
    ? join(args.contractsRoot, `${contract.name}.json`)
    : contract.artifactPath;
}

function typesOutput(contract: OpenApiContract, args: GenerateContractsArgs) {
  return args.typesRoot
    ? join(args.typesRoot, `${contract.name}.ts`)
    : contract.typesPath;
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(
    "Usage: repo-tooling api contracts [--contracts-root <temporary-root>] [--types-root libs/common/api-contracts/lib/src/generated] [--dry-run]\nDefault artifact paths come from packages/tooling/config/api-contracts.json. Alias: --docs-root is accepted for compatibility.",
  );
  process.exit(0);
}

const plan = openApiContracts().map((contract) => ({
  ...contract,
  openApiOutput: artifactOutput(contract, args),
  typesOutput: typesOutput(contract, args),
}));

if (args.dryRun) {
  console.log(JSON.stringify({ status: "dry-run", contracts: plan }, null, 2));
  process.exit(0);
}

for (const item of plan) {
  await fetchOpenApi({
    app: item.app,
    port: item.port,
    output: item.openApiOutput,
  });
  generateTypes({ input: item.openApiOutput, output: item.typesOutput });
  format([item.openApiOutput, item.typesOutput]);
  console.log(
    JSON.stringify({
      status: "generated",
      app: item.app,
      openapi: item.openApiOutput,
      types: item.typesOutput,
      source: "packages/tooling/config/api-contracts.json",
    }),
  );
}
