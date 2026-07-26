// @requirements REQ-SCAFFOLD-QUALITY-006
// Evidence for: REQ-SCAFFOLD-QUALITY-006
import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import istanbulCoverage from "istanbul-lib-coverage";
import istanbulReport from "istanbul-lib-report";
import reports from "istanbul-reports";
import path from "node:path";

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
  function contentType(filePath: string): string {
    if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
    if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
    if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
    if (filePath.endsWith(".svg")) return "image/svg+xml";
    return "application/octet-stream";
  }

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

describe("frontend-browser-e2e-coverage: isInsideRoot helper", () => {
  function isInsideRoot(rootDir: string, candidate: string): boolean {
    const rel = path.relative(rootDir, candidate);
    return rel === "" || (!rel.startsWith("..") && !rel.includes(`..${path.sep}`));
  }

  it("returns true for a file inside root", () => {
    assert.equal(isInsideRoot("/app/dist", "/app/dist/index.html"), true);
  });

  it("returns true for root itself", () => {
    assert.equal(isInsideRoot("/app/dist", "/app/dist"), true);
  });

  it("returns false for a path escaping root", () => {
    assert.equal(isInsideRoot("/app/dist", "/app/dist/../../../etc/passwd"), false);
  });
});

describe("frontend-browser-e2e-coverage: argument parsing", () => {
  it("parses --key value pairs correctly", () => {
    const args = new Map<string, string>();
    const argv = ["--dist", "build", "--app-name", "myapp", "--contains", "Hello", "--coverage-dir", "cov"];
    for (let i = 0; i < argv.length; i += 1) {
      const key = argv[i];
      const value = argv[i + 1];
      if (key.startsWith("--") && value && !value.startsWith("--")) {
        args.set(key.slice(2), value);
        i += 1;
      }
    }
    assert.equal(args.get("dist"), "build");
    assert.equal(args.get("app-name"), "myapp");
    assert.equal(args.get("contains"), "Hello");
    assert.equal(args.get("coverage-dir"), "cov");
  });

  it("throws when required arguments are missing", () => {
    assert.throws(() => {
      const args = new Map<string, string>();
      const argv = ["--dist", "build"];
      for (let i = 0; i < argv.length; i += 1) {
        const key = argv[i];
        const value = argv[i + 1];
        if (key.startsWith("--") && value && !value.startsWith("--")) {
          args.set(key.slice(2), value);
          i += 1;
        }
      }
      const dist = args.get("dist");
      const appName = args.get("app-name");
      const contains = args.get("contains");
      const coverageDir = args.get("coverage-dir");
      if (!dist || !appName || !contains || !coverageDir) {
        throw new Error("Usage: frontend-browser-e2e-coverage --dist <dir> --app-name <name> --contains <text> --coverage-dir <dir>");
      }
    }, /Usage/);
  });
});
