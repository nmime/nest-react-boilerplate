#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const contracts = [
  { app: "auth-app-api", port: 3991 },
  { app: "user-app-api", port: 3992 },
  { app: "backend-admin-app-api", port: 3993, contractName: "admin-app-api" },
];

function parseArgs(argv) {
  const args = {
    docsRoot: "docs/openapi",
    typesRoot: "libs/common/api-contracts/lib/src/generated",
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--") continue;
    const val = () => {
      const next = argv[++i];
      if (!next) throw new Error(`${item} requires a value.`);
      return next;
    };
    if (item === "--docs-root") args.docsRoot = val();
    else if (item === "--types-root") args.typesRoot = val();
    else if (item === "--dry-run") args.dryRun = true;
    else if (item === "--help" || item === "-h") args.help = true;
    else throw new Error(`Unknown option: ${item}`);
  }
  return args;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchOpenApi({ app, port, output }) {
  const env = {
    ...process.env,
    OPENAPI_ENABLED: "true",
    OPENAPI_PATH: "docs",
    AUTH_PERSISTENCE: "memory",
    AUTH_JWT_SECRET: process.env.AUTH_JWT_SECRET ?? "openapi-export-only",
    AUTH_OAUTH_ENABLED: "false",
    PORT: String(port),
  };
  const command = ["pnpm", "exec", "nx", "serve", app];
  const child = spawn(command[0], command.slice(1), {
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

  const url = `http://127.0.0.1:${port}/docs/openapi.json`;
  try {
    let body = "";
    for (let attempt = 0; attempt < 90; attempt += 1) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          body = await response.text();
          break;
        }
      } catch {}
      await wait(1000);
    }
    if (!body) {
      throw new Error(
        `${app} OpenAPI endpoint did not become ready. Logs:\n${logs.slice(-4000)}`,
      );
    }
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(JSON.parse(body), null, 2)}\n`);
  } finally {
    child.kill("SIGTERM");
    await wait(500);
    if (!child.killed) child.kill("SIGKILL");
  }
}

function generateTypes({ input, output }) {
  mkdirSync(dirname(output), { recursive: true });
  const result = spawnSync(
    "pnpm",
    ["exec", "openapi-typescript", input, "-o", output],
    { stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function formatGeneratedFiles(paths) {
  const result = spawnSync("pnpm", ["exec", "prettier", "--write", ...paths], {
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      "Usage: pnpm api:contracts -- [--docs-root docs/openapi] [--types-root libs/common/api-contracts/lib/src/generated] [--dry-run]",
    );
    return;
  }

  const plan = contracts.map((item) => {
    const name = item.contractName ?? item.app;
    return {
      ...item,
      name,
      openApiOutput: join(args.docsRoot, `${name}.json`),
      typesOutput: join(args.typesRoot, `${name}.ts`),
    };
  });

  if (args.dryRun) {
    console.log(
      JSON.stringify({ status: "dry-run", contracts: plan }, null, 2),
    );
    return;
  }

  for (const item of plan) {
    await fetchOpenApi({
      app: item.app,
      port: item.port,
      output: item.openApiOutput,
    });
    generateTypes({ input: item.openApiOutput, output: item.typesOutput });
    formatGeneratedFiles([item.openApiOutput, item.typesOutput]);
    console.log(
      JSON.stringify({
        status: "generated",
        app: item.app,
        openapi: item.openApiOutput,
        types: item.typesOutput,
      }),
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
