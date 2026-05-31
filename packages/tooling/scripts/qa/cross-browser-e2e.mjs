#!/usr/bin/env node
import { existsSync } from "node:fs";
import { commandExists, parseArgs, run, writeJson } from "./runtime-utils.mjs";

const args = parseArgs();
const all = ["chromium", "firefox", "webkit", "mobile-chrome", "mobile-safari"];
const dryRun = args.flags.has("dry-run");
const config = args.options.get("config") ?? process.env.PLAYWRIGHT_EXTENDED_CONFIG ?? "playwright.extended.config.ts";
const selected = args.options.get("project") ? [args.options.get("project")] : process.argv.filter((value) => value.startsWith("--project=")).map((value) => value.slice("--project=".length));
const projects = selected.length ? selected : (process.env.PLAYWRIGHT_MATRIX_PROJECTS?.split(",").map((value) => value.trim()).filter(Boolean) ?? all);
const passthrough = args.positional;
const reportPath = args.options.get("report") ?? "test-results/e2e-matrix/report.json";
const command = ["exec", "playwright", "test", "-c", config, ...projects.flatMap((project) => ["--project", project]), ...passthrough];

if (!existsSync(config)) {
  console.error(`Playwright matrix config not found: ${config}`);
  process.exit(1);
}
if (dryRun) {
  console.log(JSON.stringify({ status: "dry-run", command: ["pnpm", ...command], projects, config }, null, 2));
  process.exit(0);
}
if (!commandExists("pnpm")) {
  console.error("pnpm is required to run the Playwright matrix.");
  process.exit(1);
}
if (!process.env.PLAYWRIGHT_BASE_URL && process.env.PLAYWRIGHT_MANAGE_STACK !== "1") {
  writeJson(reportPath, {
    status: "skipped",
    projects,
    config,
    reason: "No PLAYWRIGHT_BASE_URL configured and PLAYWRIGHT_MANAGE_STACK=1 was not set.",
  });
  console.log(JSON.stringify({
    status: "skipped",
    preset: "cross-browser-e2e",
    reason: "Set PLAYWRIGHT_BASE_URL or PLAYWRIGHT_MANAGE_STACK=1 to run the matrix",
    report: reportPath,
  }));
  process.exit(0);
}
if (process.env.PLAYWRIGHT_AUTO_INSTALL === "1") {
  const browserNames = [...new Set(projects.map((project) => project === "mobile-chrome" ? "chromium" : project === "mobile-safari" ? "webkit" : project).filter((project) => ["chromium", "firefox", "webkit"].includes(project)))];
  run("pnpm", ["exec", "playwright", "install", "--with-deps", ...browserNames], { stdio: "inherit" });
}
const result = run("pnpm", command, { stdio: "inherit" });
process.exit(result.status);
