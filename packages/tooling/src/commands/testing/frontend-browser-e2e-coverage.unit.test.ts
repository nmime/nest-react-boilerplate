// @requirements REQ-SCAFFOLD-QUALITY-006
// Evidence for: REQ-SCAFFOLD-QUALITY-006
import * as assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";
import istanbulCoverage from "istanbul-lib-coverage";
import istanbulReport from "istanbul-lib-report";
import reports from "istanbul-reports";
import path from "node:path";
import {
  buildStaticFileIndex,
  isPathInsideRoot,
  resolveExistingStaticFile,
  resolveWorkspaceSubdirectory,
} from "./frontend-browser-e2e-coverage-paths.ts";
import {
  contentType,
  mergeVisitCoverage,
  normalizeRoutePath,
  parseCoverageArgs,
  selectRouteLinks,
} from "./frontend-browser-e2e-coverage.ts";

/**
 * Unit tests for the frontend-browser-e2e-coverage.ts module.
 *
 * These tests validate the type-level correctness of the Istanbul coverage
 * API calls and the helper functions used in the coverage collection flow.
 */

describe("frontend-browser-e2e-coverage: Istanbul types", () => {
  it("istanbul-lib-coverage.createCoverageMap returns a typed CoverageMap", () => {
    const cmap = istanbulCoverage.createCoverageMap();
    assert.equal(typeof cmap.files, "function");
    assert.equal(typeof cmap.addFileCoverage, "function");
  });

  it("coverageMap.files() returns an iterable of strings (no implicit any)", () => {
    const fc = istanbulCoverage.createFileCoverage("a.js");
    const cmap = istanbulCoverage.createCoverageMap();
    cmap.addFileCoverage(fc);

    const fc2 = istanbulCoverage.createFileCoverage("b.js");
    cmap.addFileCoverage(fc2);

    const files: string[] = [...cmap.files()];
    assert.equal(files.length, 2);
    assert.equal(typeof files[0], "string");
    assert.equal(typeof files[1], "string");
    assert.ok(files.includes("a.js"));
    assert.ok(files.includes("b.js"));
  });

  it("coverageMap.files().map with typed callback", () => {
    const fc = istanbulCoverage.createFileCoverage("src/index.ts");
    const cmap = istanbulCoverage.createCoverageMap();
    cmap.addFileCoverage(fc);

    // This map callback must be typed as (file: string) => string, not (file: any).
    const paths = cmap.files().map((file: string) => file);
    assert.equal(paths.length, 1);
    assert.equal(typeof paths[0], "string");
    assert.equal(paths[0], "src/index.ts");
  });

  it("createContext accepts typed parameters", () => {
    const fc = istanbulCoverage.createFileCoverage("x.js");
    const cmap = istanbulCoverage.createCoverageMap();
    cmap.addFileCoverage(fc);
    const context = istanbulReport.createContext({ dir: "/tmp", coverageMap: cmap });
    assert.equal(typeof context, "object");
  });

  it("reports.create returns a report with execute method", () => {
    const textReport = reports.create("text");
    assert.equal(typeof textReport.execute, "function");

    const jsonReport = reports.create("json", { file: "coverage.json" });
    assert.equal(typeof jsonReport.execute, "function");

    const lcovReport = reports.create("lcovonly", { file: "lcov.info" });
    assert.equal(typeof lcovReport.execute, "function");
  });
});

describe("frontend-browser-e2e-coverage: contentType helper", () => {
  it("returns correct content-type for HTML", () => {
    assert.equal(contentType("index.html"), "text/html; charset=utf-8");
  });

  it("returns correct content-type for JS", () => {
    assert.equal(contentType("app.js"), "text/javascript; charset=utf-8");
  });

  it("returns correct content-type for CSS", () => {
    assert.equal(contentType("styles.css"), "text/css; charset=utf-8");
  });

  it("returns correct content-type for SVG", () => {
    assert.equal(contentType("icon.svg"), "image/svg+xml");
  });

  it("returns octet-stream for unknown extensions", () => {
    assert.equal(contentType("data.bin"), "application/octet-stream");
    assert.equal(contentType("file"), "application/octet-stream");
  });
});

describe("frontend-browser-e2e-coverage: path confinement", () => {
  it("returns true for a file inside root", () => {
    assert.equal(isPathInsideRoot("/app/dist", "/app/dist/index.html"), true);
  });

  it("returns true for root itself", () => {
    assert.equal(isPathInsideRoot("/app/dist", "/app/dist"), true);
  });

  it("returns false for a path escaping root", () => {
    assert.equal(isPathInsideRoot("/app/dist", "/etc/passwd"), false);
  });

  it("rejects CLI directories outside their fixed workspace roots", () => {
    assert.equal(
      resolveWorkspaceSubdirectory("/workspace", "dist/apps/frontend/app", "dist", "--dist"),
      path.resolve("/workspace/dist/apps/frontend/app"),
    );
    assert.throws(
      () => resolveWorkspaceSubdirectory("/workspace", "../outside", "dist", "--dist"),
      /must resolve inside dist/,
    );
  });

  it("serves canonical files and falls back for traversal and symlink escapes", () => {
    const workspace = mkdtempSync(path.join(tmpdir(), "frontend-coverage-paths-"));
    const root = path.join(workspace, "dist");
    const outside = path.join(workspace, "outside");
    mkdirSync(root);
    mkdirSync(outside);
    writeFileSync(path.join(root, "index.html"), "index");
    writeFileSync(path.join(root, "app.js"), "app");
    writeFileSync(path.join(outside, "secret.txt"), "secret");
    symlinkSync(path.join(outside, "secret.txt"), path.join(root, "escape.txt"));

    try {
      const fallback = realpathSync(path.join(root, "index.html"));
      const staticFiles = buildStaticFileIndex(root);
      assert.equal(
        resolveExistingStaticFile(staticFiles, "/app.js"),
        realpathSync(path.join(root, "app.js")),
      );
      assert.equal(resolveExistingStaticFile(staticFiles, "/../../outside/secret.txt"), fallback);
      assert.equal(resolveExistingStaticFile(staticFiles, "/escape.txt"), fallback);
      assert.equal(resolveExistingStaticFile(staticFiles, "/missing.js"), fallback);
      assert.equal(resolveExistingStaticFile(staticFiles, "/%E0%A4%A"), fallback);
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });
});

describe("frontend-browser-e2e-coverage: argument parsing", () => {
  const required = [
    "--dist",
    "build",
    "--app-name",
    "myapp",
    "--contains",
    "Hello",
    "--coverage-dir",
    "cov",
  ];

  it("parses --key value pairs correctly", () => {
    const args = parseCoverageArgs(required);
    assert.equal(args.dist, "build");
    assert.equal(args.appName, "myapp");
    assert.equal(args.contains, "Hello");
    assert.equal(args.coverageDir, "cov");
    assert.deepEqual(args.visits, []);
    assert.deepEqual(args.skipVisits, []);
  });

  it("throws when required arguments are missing", () => {
    assert.throws(() => parseCoverageArgs(["--dist", "build"]), /Usage/);
  });

  it("keeps every --visit occurrence in order instead of the last one", () => {
    const args = parseCoverageArgs([
      ...required,
      "--visit",
      "/profile",
      "--visit",
      "/settings?tab=locale",
      "--visit",
      "/link/telegram#top",
    ]);
    assert.deepEqual(args.visits, ["/profile", "/settings", "/link/telegram"]);
  });

  it("collects repeated --skip-visit exclusions", () => {
    const args = parseCoverageArgs([...required, "--skip-visit", "/tma", "--skip-visit", "/auth"]);
    assert.deepEqual(args.skipVisits, ["/tma", "/auth"]);
  });

  it("rejects navigation targets that leave the app origin", () => {
    for (const target of ["relative/path", "../escape", "https://elsewhere/x", "//elsewhere/x"]) {
      assert.throws(
        () => parseCoverageArgs([...required, "--visit", target]),
        /--visit must be an absolute same-origin path/,
        `expected ${target} to be rejected`,
      );
    }
  });

  it("names the rejected option so the failure points at the right flag", () => {
    assert.throws(
      () => normalizeRoutePath("https://elsewhere/x", "--skip-visit"),
      /--skip-visit must be an absolute same-origin path/,
    );
    assert.equal(normalizeRoutePath("/profile?tab=a#b", "--visit"), "/profile");
  });
});

describe("frontend-browser-e2e-coverage: route link discovery", () => {
  const isRoutePath = (candidate: string): boolean => !candidate.startsWith("/assets/");

  it("keeps same-origin route links once, in DOM order", () => {
    assert.deepEqual(
      selectRouteLinks(["/", "/profile", "/settings", "/profile"], isRoutePath),
      ["/", "/profile", "/settings"],
    );
  });

  it("drops anchors that are not app routes", () => {
    assert.deepEqual(
      selectRouteLinks(
        [
          null,
          "#xr-content",
          "mailto:support@example.com",
          "https://elsewhere/docs",
          "//elsewhere/docs",
          "/assets/index.js",
          "/profile",
        ],
        isRoutePath,
      ),
      ["/profile"],
    );
  });

  it("normalises query and hash so one route is not visited twice", () => {
    assert.deepEqual(selectRouteLinks(["/settings?tab=locale", "/settings#top"], isRoutePath), [
      "/settings",
    ]);
  });
});

describe("frontend-browser-e2e-coverage: per-visit coverage merge", () => {
  const visitCoverage = (statements: Record<string, number>) => ({
    "src/page.tsx": {
      path: "src/page.tsx",
      statementMap: {
        "0": { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } },
        "1": { start: { line: 2, column: 0 }, end: { line: 2, column: 10 } },
      },
      fnMap: {},
      branchMap: {},
      s: statements,
      f: {},
      b: {},
    },
  });

  it("adds each visit's counters instead of replacing the previous ones", () => {
    const total = istanbulCoverage.createCoverageMap();
    mergeVisitCoverage(total, visitCoverage({ "0": 3, "1": 0 }));
    mergeVisitCoverage(total, visitCoverage({ "0": 0, "1": 5 }));

    const summary = total.getCoverageSummary().toJSON();
    assert.equal(summary.statements.covered, 2, "both visits must contribute covered statements");
    assert.deepEqual(total.fileCoverageFor("src/page.tsx").s, { "0": 3, "1": 5 });
  });
});
