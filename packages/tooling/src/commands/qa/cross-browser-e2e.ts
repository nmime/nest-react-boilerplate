#!/usr/bin/env node
import { existsSync } from "node:fs";
import { crossBrowserProjects, installedBrowserForProject } from "./browser-matrix.ts";
import { packageManagerInvocation, parseArgs, run, writeJson } from "./runtime-utils.ts";

const args = parseArgs();
const all = [...crossBrowserProjects];
const dryRun = args.flags.has("dry-run");
const config = args.options.get("config") ?? process.env.PLAYWRIGHT_EXTENDED_CONFIG ?? "playwright.extended.config.ts";
const projectOption = args.options.get("project");
const selected = projectOption ? [projectOption] : process.argv.filter((value) => value.startsWith("--project=")).map((value) => value.slice("--project=".length));
const projects = selected.length ? selected : (process.env.PLAYWRIGHT_MATRIX_PROJECTS?.split(",").map((value) => value.trim()).filter(Boolean) ?? all);
const passthrough = args.positional;
const reportPath = args.options.get("report") ?? "test-results/e2e-matrix/report.json";
const command = ["exec", "playwright", "test", "-c", config, ...projects.flatMap((project) => ["--project", project]), ...passthrough];
const fixedRuntimeStackPorts = {
  POSTGRES_PORT: "5432",
  ADMIN_APP_API_PORT: "3001",
  USER_APP_API_PORT: "3002",
  AUTH_APP_API_PORT: "3003",
  ADMIN_APP_PORT: "8081",
  USER_APP_PORT: "8082",
  LANDING_APP_PORT: "8083",
  SITE_APP_PORT: "8084",
};
const externalRuntimeUrls = [
  { names: ["FULLSTACK_ADMIN_API_URL", "ADMIN_APP_API_URL"], port: "ADMIN_APP_API_PORT" },
  { names: ["FULLSTACK_USER_API_URL", "USER_APP_API_URL"], port: "USER_APP_API_PORT" },
  { names: ["FULLSTACK_AUTH_API_URL", "AUTH_APP_API_URL"], port: "AUTH_APP_API_PORT" },
  { names: ["FULLSTACK_ADMIN_APP_URL", "ADMIN_APP_URL"], port: "ADMIN_APP_PORT" },
  {
    names: ["FULLSTACK_USER_APP_URL", "USER_APP_URL", "FULLSTACK_BASE_URL"],
    port: "USER_APP_PORT",
  },
  { names: ["FULLSTACK_LANDING_APP_URL", "LANDING_APP_URL"], port: "LANDING_APP_PORT" },
  { names: ["FULLSTACK_SITE_APP_URL", "SITE_APP_URL"], port: "SITE_APP_PORT" },
] as const;
const hasAnyExplicitRuntimeUrl = externalRuntimeUrls.some(({ names }) => names.some((name) => process.env[name]?.trim()));
const hasCompleteExplicitRuntimeUrls = externalRuntimeUrls.every(({ names }) =>
  names.some((name) => process.env[name]?.trim()),
);
if (hasAnyExplicitRuntimeUrl && !hasCompleteExplicitRuntimeUrls && !process.env.PLAYWRIGHT_BASE_URL) {
  console.error('External Playwright mode requires either PLAYWRIGHT_BASE_URL or every FULLSTACK_*_URL.');
  process.exit(2);
}
const usesExternalRuntimeStack = Boolean(process.env.PLAYWRIGHT_BASE_URL) || hasCompleteExplicitRuntimeUrls;
const matrixEnv: Record<string, string> = {};
if (usesExternalRuntimeStack) {
  for (const [name, fallback] of Object.entries(fixedRuntimeStackPorts)) {
    if (!process.env[name]) matrixEnv[name] = fallback;
  }
  if (process.env.PLAYWRIGHT_BASE_URL) {
    const baseUrl = new URL(process.env.PLAYWRIGHT_BASE_URL);
    for (const { names, port } of externalRuntimeUrls) {
      if (names.some((name) => process.env[name])) continue;
      const serviceUrl = new URL(baseUrl);
      serviceUrl.port = process.env[port] ?? matrixEnv[port] ?? fixedRuntimeStackPorts[port];
      serviceUrl.pathname = "/";
      serviceUrl.search = "";
      serviceUrl.hash = "";
      matrixEnv[names[0]] = serviceUrl.toString().replace(/\/$/u, "");
    }
  }
}
Object.assign(process.env, matrixEnv);

if (!existsSync(config)) {
  console.error(`Playwright matrix config not found: ${config}`);
  process.exit(1);
}
if (dryRun) {
  console.log(JSON.stringify({ status: "dry-run", command: ["pnpm", ...command], projects, config, env: matrixEnv }, null, 2));
  process.exit(0);
}
if (!usesExternalRuntimeStack && process.env.PLAYWRIGHT_MANAGE_STACK !== "1") {
  writeJson(reportPath, {
    status: "skipped",
    projects,
    config,
    reason: "No complete external URL set configured and PLAYWRIGHT_MANAGE_STACK=1 was not set.",
  });
  console.log(JSON.stringify({
    status: "skipped",
    preset: "cross-browser-e2e",
    reason: "Set PLAYWRIGHT_BASE_URL, every FULLSTACK_*_URL, or PLAYWRIGHT_MANAGE_STACK=1 to run the matrix",
    report: reportPath,
  }));
  // Exiting 0 here made this an unfalsifiable gate: world-class-gates' real-user-journey check
  // only inspects the exit code, so a misconfigured matrix counted as journey evidence. Skipping
  // stays available for interactive local runs only.
  if (process.env.CI === "true" || process.env.PLAYWRIGHT_REQUIRE_STACK === "1") {
    console.error(
      "cross-browser-e2e: refusing to report success without a runtime stack. Set PLAYWRIGHT_BASE_URL, every FULLSTACK_*_URL, or PLAYWRIGHT_MANAGE_STACK=1.",
    );
    process.exit(2);
  }
  process.exit(0);
}
if (process.env.PLAYWRIGHT_AUTO_INSTALL === "1") {
  const browserNames = [...new Set(projects.map(installedBrowserForProject).filter((project): project is string => project !== null))];
  const install = packageManagerInvocation(["exec", "playwright", "install", "--with-deps", ...browserNames]);
  const installResult = run(install.command, install.args, { stdio: "inherit" });
  if (installResult.status !== 0) process.exit(installResult.status);
}
const invocation = packageManagerInvocation(command);
const result = run(invocation.command, invocation.args, { stdio: "inherit" });
process.exit(result.status);
