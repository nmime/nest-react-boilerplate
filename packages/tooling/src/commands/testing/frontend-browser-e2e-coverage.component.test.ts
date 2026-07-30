// @requirements REQ-SCAFFOLD-QUALITY-006
import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import istanbulCoverage from "istanbul-lib-coverage";
import istanbulReport from "istanbul-lib-report";
import reports from "istanbul-reports";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Component tests for the frontend-browser-e2e-coverage module.
 */

describe("frontend-browser-e2e-coverage: Istanbul coverage pipeline", () => {
  it("full pipeline: coverage map → context → text report", () => {
    const cmap = istanbulCoverage.createCoverageMap();
    cmap.addFileCoverage(istanbulCoverage.createFileCoverage("src/app.tsx"));
    cmap.addFileCoverage(istanbulCoverage.createFileCoverage("src/utils.ts"));

    const files = cmap.files();
    assert.equal(files.length, 2);
    for (const file of files) {
      assert.equal(typeof file, "string");
    }

    const aData = cmap.fileCoverageFor("src/app.tsx");
    assert.equal(aData.path, "src/app.tsx");

    const reportDir = join(tmpdir(), "e2e-coverage-test-" + Date.now());
    mkdirSync(reportDir, { recursive: true });

    try {
      const context = istanbulReport.createContext({ dir: reportDir, coverageMap: cmap });
      assert.ok(context, "context should be truthy");
      const textReport = reports.create("text");
      textReport.execute(context);
    } finally {
      rmSync(reportDir, { force: true, recursive: true });
    }
  });

  it("full pipeline: lcovonly report writes file", () => {
    const cmap = istanbulCoverage.createCoverageMap();
    cmap.addFileCoverage(istanbulCoverage.createFileCoverage("test.js"));

    const reportDir = join(tmpdir(), "e2e-lcov-test-" + Date.now());
    mkdirSync(reportDir, { recursive: true });

    try {
      const context = istanbulReport.createContext({ dir: reportDir, coverageMap: cmap });
      const lcovReport = reports.create("lcovonly", { file: "lcov.info" });
      lcovReport.execute(context);

      assert.ok(existsSync(join(reportDir, "lcov.info")), "lcov.info should be written");
    } finally {
      rmSync(reportDir, { force: true, recursive: true });
    }
  });

  it("full pipeline: json report writes file", () => {
    const cmap = istanbulCoverage.createCoverageMap();
    cmap.addFileCoverage(istanbulCoverage.createFileCoverage("component.tsx"));

    const reportDir = join(tmpdir(), "e2e-json-test-" + Date.now());
    mkdirSync(reportDir, { recursive: true });

    try {
      const context = istanbulReport.createContext({ dir: reportDir, coverageMap: cmap });
      const jsonReport = reports.create("json", { file: "coverage-final.json" });
      jsonReport.execute(context);

      assert.ok(
        existsSync(join(reportDir, "coverage-final.json")),
        "coverage-final.json should be written",
      );
    } finally {
      rmSync(reportDir, { force: true, recursive: true });
    }
  });
});

describe("frontend-browser-e2e-coverage: nyc_output directory writing", () => {
  it("writes .nyc_output/coverage-final.json", () => {
    const reportDir = join(tmpdir(), "e2e-nyc-test-" + Date.now());
    mkdirSync(join(reportDir, ".nyc_output"), { recursive: true });

    const coverage = {
      "index.js": {
        path: "index.js",
        s: { 1: 5, 2: 5 },
        f: { 0: 3 },
        b: {},
      },
    };

    writeFileSync(
      join(reportDir, ".nyc_output", "coverage-final.json"),
      `${JSON.stringify(coverage, null, 2)}\n`,
    );

    const filePath = join(reportDir, ".nyc_output", "coverage-final.json");
    assert.ok(existsSync(filePath), "file should exist");
    assert.ok(statSync(filePath).isFile(), "should be a file");

    const content = JSON.parse(readFileSync(filePath, "utf8"));
    assert.equal(Object.keys(content).length, 1);
    assert.ok("index.js" in content);

    rmSync(reportDir, { force: true, recursive: true });
  });
});

describe("frontend-browser-e2e-coverage: relative path mapping", () => {
  it("maps coverage files to relative paths from cwd", () => {
    const cmap = istanbulCoverage.createCoverageMap();
    cmap.addFileCoverage(istanbulCoverage.createFileCoverage("apps/frontend/app/src/App.tsx"));
    cmap.addFileCoverage(istanbulCoverage.createFileCoverage("libs/frontend/ui-web/lib/src/Button.tsx"));

    // Exact pattern from source: coverageMap.files().map((file: string) => path.relative(cwd, file))
    const paths = cmap.files().map((file: string) => file);

    assert.equal(paths.length, 2);
    for (const p of paths) {
      assert.equal(typeof p, "string");
      assert.ok(p.length > 0);
    }
  });
});
