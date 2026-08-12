#!/usr/bin/env node
// Evidence for: REQ-SCAFFOLD-QUALITY-006
import { createReadStream, realpathSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

type VisitCoverage = Parameters<typeof istanbulCoverage.createCoverageMap>[0];
type CoverageMap = ReturnType<typeof istanbulCoverage.createCoverageMap>;

export interface CoverageArgs {
  appName: string;
  contains: string;
  coverageDir: string;
  dist: string;
  /** Routes discovered from the page that must not be visited. */
  skipVisits: readonly string[];
  /** Routes to visit on top of the ones the app links to itself. */
  visits: readonly string[];
}

const usage =
  "Usage: frontend-browser-e2e-coverage --dist <dir> --app-name <name> --contains <text> --coverage-dir <dir> [--visit <path>]... [--skip-visit <path>]...";

/**
 * How long to wait for the marker text to appear after navigation. Generous
 * because a loaded CI runner hydrates slowly, and a slow pass beats a flaky
 * failure in a blocking lane.
 */
const pageTextTimeoutMs = Number(process.env["FRONTEND_E2E_PAGE_TEXT_TIMEOUT_MS"] ?? "20000");

/**
 * Upper bound on the routes one run walks. The walk follows the app's own links,
 * so a runaway link graph (a paginated list linking every page, say) would
 * otherwise turn a blocking lane into an unbounded crawl.
 */
const maxVisits = Number(process.env["FRONTEND_E2E_MAX_VISITS"] ?? "50");

/**
 * The origin is irrelevant to the comparison — only "does this href stay on the
 * app we are serving" is — so any fixed loopback origin works as the base.
 */
const routeOrigin = "http://127.0.0.1";

function toRoutePath(value: string): string | undefined {
  // A protocol-relative `//host/x` also starts with a slash but leaves the origin.
  if (!value.startsWith("/") || value.startsWith("//")) return undefined;
  try {
    const target = new URL(value, routeOrigin);
    return target.origin === routeOrigin ? target.pathname : undefined;
  } catch {
    return undefined;
  }
}

/**
 * A navigation target reduced to the path the static server can answer. Query
 * and hash are dropped so `/settings?tab=locale` and `/settings#top` are one
 * visit rather than three.
 */
export function normalizeRoutePath(value: string, optionName: string): string {
  const routePath = toRoutePath(value);
  if (routePath === undefined) {
    throw new Error(
      `${optionName} must be an absolute same-origin path such as /profile, received: ${value}`,
    );
  }
  return routePath;
}

export function parseCoverageArgs(argv: readonly string[]): CoverageArgs {
  const values = new Map<string, string>();
  const visits: string[] = [];
  const skipVisits: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--")) continue;
    index += 1;
    // The navigation options are repeatable; a Map would keep only the last
    // occurrence, which is why "visit these three routes" used to be inexpressible.
    switch (key) {
      case "--visit":
        visits.push(normalizeRoutePath(value, "--visit"));
        break;
      case "--skip-visit":
        skipVisits.push(normalizeRoutePath(value, "--skip-visit"));
        break;
      default:
        values.set(key.slice(2), value);
    }
  }

  const dist = values.get("dist");
  const appName = values.get("app-name");
  const contains = values.get("contains");
  const coverageDir = values.get("coverage-dir");
  if (!dist || !appName || !contains || !coverageDir) {
    throw new Error(usage);
  }

  return { appName, contains, coverageDir, dist, skipVisits, visits };
}

/**
 * The app's own routes among the anchors it rendered, deduplicated and in DOM
 * order. `isRoutePath` rejects hrefs the dist serves as a file, so assets and
 * downloads are told apart by what the server actually answers rather than by an
 * extension list that would drift.
 */
export function selectRouteLinks(
  hrefs: readonly (string | null | undefined)[],
  isRoutePath: (candidate: string) => boolean,
): string[] {
  const routes: string[] = [];
  for (const href of hrefs) {
    if (!href) continue;
    const routePath = toRoutePath(href);
    if (routePath === undefined || !isRoutePath(routePath)) continue;
    if (!routes.includes(routePath)) routes.push(routePath);
  }
  return routes;
}

/**
 * Folds one visit's `window.__coverage__` into the run total. Each visit is a
 * full document load and therefore a fresh JS context, so the counters have to
 * be merged as they are harvested — snapshotting once at the end would keep
 * whatever the last route touched and drop every route before it.
 */
export function mergeVisitCoverage(total: CoverageMap, visitCoverage: VisitCoverage): void {
  total.merge(istanbulCoverage.createCoverageMap(visitCoverage));
}

export function contentType(filePath: string): string {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

async function runCoverage(args: CoverageArgs): Promise<void> {
  const workspaceRoot = realpathSync(process.cwd());
  const distRoot = path.resolve(workspaceRoot, "dist");
  const root = realpathSync(
    resolveWorkspaceSubdirectory(workspaceRoot, args.dist, "dist", "--dist"),
  );
  if (!isPathInsideRoot(distRoot, root)) {
    throw new Error("--dist must not escape the workspace dist directory through a symbolic link");
  }
  const reportDir = resolveWorkspaceSubdirectory(
    workspaceRoot,
    args.coverageDir,
    path.join("coverage", "e2e"),
    "--coverage-dir",
  );
  const staticFiles = buildStaticFileIndex(root);
  // Only the paths the server answers with the SPA shell are routes; anything
  // that resolves to a real file in the dist is an asset the router never sees.
  const isRoutePath = (candidate: string): boolean =>
    resolveExistingStaticFile(staticFiles, candidate) === staticFiles.fallback;

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
  const skipped = new Set(args.skipVisits);
  const pending = ["/", ...args.visits].filter((routePath) => !skipped.has(routePath));
  const visited: string[] = [];
  const coverageMap = istanbulCoverage.createCoverageMap();
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;

  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    while (pending.length > 0) {
      const routePath = pending.shift();
      if (routePath === undefined || visited.includes(routePath)) continue;

      await page.goto(`${baseUrl}${routePath}`, { waitUntil: "networkidle" });
      if (visited.length === 0) {
        // `networkidle` can settle before React hydrates and its session probe
        // resolves, so the marker text has to be POLLED. Reading `innerText` once made
        // this blocking gate flaky: the admin app intermittently failed on
        // `Expected admin-app page text to contain: Access denied` while passing
        // locally and on the very next run.
        try {
          await page.waitForFunction(
            (expected: string) => document.body.innerText.includes(expected),
            args.contains,
            { timeout: pageTextTimeoutMs },
          );
        } catch {
          // The previous error named only the expectation, which left a CI failure with
          // no way to tell "still loading" from "rendered something else".
          const bodyText = await page.locator("body").innerText();
          throw new Error(
            `Expected ${args.appName} page text to contain: ${args.contains}\n` +
              `Waited ${pageTextTimeoutMs}ms. Rendered body text was:\n${bodyText.slice(0, 800)}`,
          );
        }
      } else {
        // Routes past the entry point have no shared marker copy, so the settle
        // signal is the app having rendered anything at all into its mount.
        try {
          await page.waitForFunction(() => document.body.innerText.trim().length > 0, undefined, {
            timeout: pageTextTimeoutMs,
          });
        } catch {
          throw new Error(
            `${args.appName} rendered nothing at ${routePath} within ${pageTextTimeoutMs}ms. ` +
              "Fix the route, or exclude it with --skip-visit.",
          );
        }
      }
      visited.push(routePath);

      const coverage = await page.evaluate(() => globalThis.__coverage__);
      if (!coverage || Object.keys(coverage).length === 0) {
        throw new Error(
          `${args.appName} did not expose window.__coverage__ at ${routePath}; ensure VITE_E2E_COVERAGE=true instruments the Vite build.`,
        );
      }
      mergeVisitCoverage(coverageMap, coverage);

      // The route set is derived from the app, not configured beside it: every
      // route the shell links to is walked, so a product adding a page grows the
      // covered total instead of only the denominator.
      const hrefs = await page.evaluate(() =>
        [...document.querySelectorAll("a[href]")].map((anchor) => anchor.getAttribute("href")),
      );
      for (const link of selectRouteLinks(hrefs, isRoutePath)) {
        if (visited.includes(link) || pending.includes(link) || skipped.has(link)) continue;
        pending.push(link);
      }
      if (visited.length + pending.length > maxVisits) {
        throw new Error(
          `${args.appName} links more than ${maxVisits} routes; raise FRONTEND_E2E_MAX_VISITS or narrow the walk with --skip-visit.`,
        );
      }
    }

    await mkdir(reportDir, { recursive: true });
    await mkdir(path.join(reportDir, ".nyc_output"), { recursive: true });
    await writeFile(
      path.join(reportDir, ".nyc_output", "coverage-final.json"),
      `${JSON.stringify(coverageMap.toJSON(), null, 2)}\n`,
    );

    const context = istanbulReport.createContext({ dir: reportDir, coverageMap });
    reports.create("text").execute(context);
    reports.create("lcovonly", { file: "lcov.info" }).execute(context);
    reports.create("json", { file: "coverage-final.json" }).execute(context);
    console.log(
      JSON.stringify(
        {
          appName: args.appName,
          url: baseUrl,
          coverageDir: path.relative(process.cwd(), reportDir),
          visitedPaths: visited,
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
}

// Compared through realpath because the CLI receives the module path resolved
// against `process.cwd()`, which may reach this file through a symlinked
// checkout while `import.meta.url` never does.
function isSameFile(left: string, right: string): boolean {
  try {
    return realpathSync(left) === realpathSync(right);
  } catch {
    return path.resolve(left) === path.resolve(right);
  }
}

// The CLI body only runs when this module is the process entry: the unit tests
// import the parsing, link-selection and merge helpers above, and static-check
// loads every command module's import graph.
const entry = process.argv[1];
if (entry !== undefined && isSameFile(entry, fileURLToPath(import.meta.url))) {
  await runCoverage(parseCoverageArgs(process.argv.slice(2)));
}
