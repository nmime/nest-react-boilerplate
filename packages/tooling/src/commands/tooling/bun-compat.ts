import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { delimiter, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { CommandContext } from "../../cli.js";
import { detectJavaScriptRuntime } from "../../runtime/environment.js";

export interface BunCompatibilityProbe {
  name: string;
  nxArgs: readonly string[];
  runtime?: "bun" | "node";
}

export interface BunCompatibilityInvocation {
  program: string;
  args: readonly string[];
  environment: NodeJS.ProcessEnv;
}

export const bunCompatibilityProbes: readonly BunCompatibilityProbe[] = [
  {
    name: "Nx project graph",
    nxArgs: ["show", "projects"],
  },
  {
    name: "Vite application build",
    nxArgs: ["run", "admin-app:build", "--skip-nx-cache"],
  },
  {
    name: "Vike SSR build",
    nxArgs: ["run", "site-app:build", "--skip-nx-cache"],
  },
  {
    name: "Expo web export (Node toolchain boundary)",
    nxArgs: ["run", "mobile-app:export", "--skip-nx-cache"],
    runtime: "node",
  },
  {
    name: "NestJS application build",
    nxArgs: ["run", "auth-app-api:build", "--skip-nx-cache"],
  },
  {
    name: "Selected unit tests",
    nxArgs: [
      "run-many",
      "-t",
      "test",
      "--projects=@app/backend-common-bootstrap,@app/backend-common-exception,@app/backend-common-health,auth-app-api",
      "--skip-nx-cache",
    ],
  },
  {
    name: "Auth API end-to-end tests without the Node-only coverage provider",
    nxArgs: ["run", "auth-app-api:e2e", "--skip-nx-cache", "--", "--coverage.enabled=false"],
  },
] as const;

export async function runBunCompatibilityCommand(context: CommandContext): Promise<number> {
  if (context.argv.includes("--help") || context.argv.includes("-h")) {
    process.stdout.write(
      "Usage: pnpm run bun:check\n\nRuns the pinned Bun compatibility contract across Nx, builds, tests, and runtime smokes.\n",
    );
    return 0;
  }

  const runtime = detectJavaScriptRuntime();
  if (runtime.name !== "bun") {
    process.stderr.write("Bun compatibility must execute under Bun. Run: pnpm run bun:check\n");
    return 1;
  }

  const pinnedVersion = readPinnedBunVersion(context.workspaceRoot);
  if (runtime.version !== pinnedVersion) {
    process.stderr.write(`Bun ${runtime.version} is active, but .bun-version requires ${pinnedVersion}.\n`);
    return 1;
  }

  process.stdout.write(`Bun ${runtime.version} compatibility contract\n`);
  const environment = compatibilityEnvironment();

  for (const probe of bunCompatibilityProbes) {
    process.stdout.write(`\n==> ${probe.name}\n`);
    const command = createBunCompatibilityInvocation(probe, environment, process.execPath);
    const result = spawnSync(command.program, command.args, {
      cwd: context.workspaceRoot,
      env: command.environment,
      stdio: "inherit",
    });

    if (result.status !== 0) {
      process.stderr.write(`${probe.name} failed with exit code ${result.status ?? 1}.\n`);
      return result.status ?? 1;
    }
  }

  try {
    await runSiteRuntimeSmoke(context.workspaceRoot, environment);
    await runAuthRuntimeSmoke(context.workspaceRoot, environment);
  } catch (error: unknown) {
    process.stderr.write(`${errorMessage(error)}\n`);
    return 1;
  }

  process.stdout.write("\nBun compatibility contract passed.\n");
  return 0;
}

export function createBunCompatibilityInvocation(
  probe: BunCompatibilityProbe,
  environment: NodeJS.ProcessEnv,
  bunExecutable: string,
): BunCompatibilityInvocation {
  const probeEnvironment = { ...environment };
  if (probe.runtime === "node") {
    delete probeEnvironment.BUN_BE_BUN;
    return {
      program: "node",
      args: ["node_modules/nx/dist/bin/nx.js", ...probe.nxArgs],
      environment: probeEnvironment,
    };
  }

  return {
    program: bunExecutable,
    args: ["run", "--bun", "nx", ...probe.nxArgs],
    environment: probeEnvironment,
  };
}

export function readPinnedBunVersion(workspaceRoot: string): string {
  const versionPath = join(workspaceRoot, ".bun-version");
  if (!existsSync(versionPath)) {
    throw new Error(".bun-version is required for reproducible Bun support.");
  }

  const version = readFileSync(versionPath, "utf8").trim();
  if (!/^\d+\.\d+\.\d+$/u.test(version)) {
    throw new Error(`.bun-version must contain an exact semantic version; received: ${version || "<empty>"}`);
  }
  return version;
}

function compatibilityEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    CI: process.env.CI ?? "true",
    NX_DAEMON: "false",
    VITE_API_BASE_URL_MODE: "same-origin",
  };
  delete environment.NO_COLOR;
  delete environment.FORCE_COLOR;
  return environment;
}

async function runSiteRuntimeSmoke(workspaceRoot: string, environment: NodeJS.ProcessEnv): Promise<void> {
  process.stdout.write("\n==> Vike production runtime smoke\n");
  const port = await reserveAvailablePort();
  const entry = join(workspaceRoot, "dist/apps/frontend/site/server/index.js");
  await runHttpRuntime({
    name: "site-app",
    entry,
    environment: {
      ...environment,
      NODE_ENV: "production",
      SITE_APP_PORT: String(port),
    },
    urls: [`http://127.0.0.1:${port}/health`, `http://127.0.0.1:${port}/`, `http://127.0.0.1:${port}/problems`],
  });
}

async function runAuthRuntimeSmoke(workspaceRoot: string, environment: NodeJS.ProcessEnv): Promise<void> {
  process.stdout.write("\n==> NestJS production-artifact runtime smoke\n");
  const port = await reserveAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const smokeCredential = ["bun", "compat", "only", "9d6aQ3w7K2m8V5x1R4t0"].join("-");
  const entry = join(
    workspaceRoot,
    "dist/apps/backend/auth/auth-app-api/apps/backend/auth/auth-app-api/src/main.js",
  );
  const readyUrl = `http://127.0.0.1:${port}/ready`;
  await runHttpRuntime({
    name: "auth-app-api",
    entry,
    environment: {
      ...environment,
      AUTH_APP_API_PORT: String(port),
      SESSION_SECRET: smokeCredential,
      AUTH_PERSISTENCE: "memory",
      BETTER_AUTH_SECRET: smokeCredential,
      BETTER_AUTH_URL: baseUrl,
      DISCORD_CLIENT_ID: "bun-compat-discord-client",
      DISCORD_CLIENT_SECRET: smokeCredential,
      DISCORD_REDIRECT_URI: `${baseUrl}/auth/discord/callback`,
      NODE_ENV: "development",
      OPENAPI_ENABLED: "true",
      OTEL_ENABLED: "false",
      NODE_PATH: [join(workspaceRoot, "libs/backend/node_modules"), environment.NODE_PATH]
        .filter(Boolean)
        .join(delimiter),
    },
    urls: [`${baseUrl}/live`, readyUrl],
    validate: async () => {
      const response = await fetch(readyUrl);
      const body = (await response.json()) as {
        data?: { checks?: Array<{ name?: string; details?: { runtime?: string } }> };
      };
      const runtimeCheck = body.data?.checks?.find((check) => check.name === "runtime");
      if (runtimeCheck?.details?.runtime !== "bun") {
        throw new Error("auth-app-api readiness did not report runtime=bun.");
      }
    },
  });
}

interface HttpRuntimeOptions {
  name: string;
  entry: string;
  environment: NodeJS.ProcessEnv;
  urls: readonly string[];
  validate?: () => Promise<void>;
}

async function runHttpRuntime(options: HttpRuntimeOptions): Promise<void> {
  if (!existsSync(options.entry)) {
    throw new Error(`${options.name} runtime entry is missing: ${options.entry}`);
  }

  const child = spawn(process.execPath, [options.entry], {
    cwd: process.cwd(),
    env: options.environment,
    stdio: ["ignore", "inherit", "inherit"],
  });

  try {
    await waitForUrls(child, options.urls);
    await options.validate?.();
  } finally {
    await stopChild(child);
  }
}

async function waitForUrls(child: ChildProcess, urls: readonly string[]): Promise<void> {
  const deadline = Date.now() + 30_000;
  let lastError: unknown;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Runtime process exited before becoming ready with code ${child.exitCode}.`);
    }

    try {
      for (const url of urls) {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`${url} returned HTTP ${response.status}`);
        }
      }
      return;
    } catch (error: unknown) {
      lastError = error;
      await delay(250);
    }
  }

  throw new Error(`Runtime smoke timed out: ${errorMessage(lastError)}`);
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (childHasExited(child)) {
    return;
  }

  child.kill("SIGTERM");
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (childHasExited(child)) {
      return;
    }
    await delay(100);
  }

  child.kill("SIGKILL");
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (childHasExited(child)) {
      return;
    }
    await delay(100);
  }

  throw new Error("Runtime smoke child did not stop after SIGTERM and SIGKILL.");
}

export function childHasExited(child: Pick<ChildProcess, "exitCode" | "signalCode">): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

async function reserveAvailablePort(): Promise<number> {
  return new Promise<number>((resolvePort, rejectPort) => {
    const server = createServer();
    server.once("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        rejectPort(new Error("Unable to reserve a local runtime-smoke port."));
        return;
      }

      const { port } = address;
      server.close((error) => (error ? rejectPort(error) : resolvePort(port)));
    });
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
