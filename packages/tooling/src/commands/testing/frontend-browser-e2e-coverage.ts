#!/usr/bin/env node
// Evidence for: REQ-SCAFFOLD-QUALITY-006
import { createReadStream, realpathSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { chromium } from "@playwright/test";
import istanbulCoverage from "istanbul-lib-coverage";
import istanbulReport from "istanbul-lib-report";
import reports from "istanbul-reports";
import {
  buildStaticFileIndex,
  isPathInsideRoot,
  resolveExistingStaticFile,
  resolveWorkspaceSubdirectory,
} from "./frontend-browser-e2e-coverage-paths.ts";

declare global {
  // Injected into the page by the istanbul-instrumented Vite build (VITE_E2E_COVERAGE=true).
  // eslint-disable-next-line no-var
  var __coverage__: Parameters<typeof istanbulCoverage.createCoverageMap>[0];
}

const args = new Map<string, string>();
for (let index = 2; index < process.argv.length; index += 1) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (key.startsWith("--") && value && !value.startsWith("--")) {
    args.set(key.slice(2), value);
    index += 1;
  }
}

const dist = args.get("dist");
const appName = args.get("app-name");
const contains = args.get("contains");
const coverageDir = args.get("coverage-dir");
if (!dist || !appName || !contains || !coverageDir) {
  throw new Error(
    "Usage: frontend-browser-e2e-coverage --dist <dir> --app-name <name> --contains <text> --coverage-dir <dir>",
  );
}

const workspaceRoot = realpathSync(process.cwd());
const distRoot = path.resolve(workspaceRoot, "dist");
const root = realpathSync(
  resolveWorkspaceSubdirectory(workspaceRoot, dist, "dist", "--dist"),
);
if (!isPathInsideRoot(distRoot, root)) {
  throw new Error("--dist must not escape the workspace dist directory through a symbolic link");
}
const reportDir = resolveWorkspaceSubdirectory(
  workspaceRoot,
  coverageDir,
  path.join("coverage", "e2e"),
  "--coverage-dir",
);
const staticFiles = buildStaticFileIndex(root);

function contentType(filePath: string): string {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

const server = createServer((request, response) => {
  try {
    const filePath = resolveExistingStaticFile(staticFiles, request.url ?? "/");
    response.setHeader("content-type", contentType(filePath));
    createReadStream(filePath).pipe(response);
  } catch (error) {
    response.statusCode = 500;
    response.end(error instanceof Error ? error.message : "Static server failed");
  }
});

await new Promise<void>((resolve) => {
  server.listen(0, "127.0.0.1", () => resolve());
});
const address = server.address();
if (!address || typeof address === "string") {
  throw new Error("Unable to allocate frontend e2e server port.");
}

const baseUrl = `http://127.0.0.1:${address.port}`;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const bodyText = await page.locator("body").innerText();
  if (!bodyText.includes(contains)) {
    throw new Error(`Expected ${appName} page text to contain: ${contains}`);
  }

  const coverage = await page.evaluate(() => globalThis.__coverage__);
  if (!coverage || Object.keys(coverage).length === 0) {
    throw new Error(
      `${appName} did not expose window.__coverage__; ensure VITE_E2E_COVERAGE=true instruments the Vite build.`,
    );
  }

  await mkdir(reportDir, { recursive: true });
  await mkdir(path.join(reportDir, ".nyc_output"), { recursive: true });
  await writeFile(
    path.join(reportDir, ".nyc_output", "coverage-final.json"),
    `${JSON.stringify(coverage, null, 2)}\n`,
  );

  const coverageMap = istanbulCoverage.createCoverageMap(coverage);
  const context = istanbulReport.createContext({ dir: reportDir, coverageMap });
  reports.create("text").execute(context);
  reports.create("lcovonly", { file: "lcov.info" }).execute(context);
  reports.create("json", { file: "coverage-final.json" }).execute(context);
  console.log(
    JSON.stringify(
      {
        appName,
        url: baseUrl,
        coverageDir: path.relative(process.cwd(), reportDir),
        coveredFiles: coverageMap
          .files()
          .map((file: string) => path.relative(process.cwd(), file)),
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
}
