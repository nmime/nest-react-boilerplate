// @requirements REQ-SCAFFOLD-QUALITY-006
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { workspaceRoot } from "./runtime-utils.ts";
import {
  baseGitleaksConfigPath,
  dockerGitleaksInvocation,
  gitleaksEngineReportPath,
  nativeGitleaksInvocation,
  productGitleaksConfigPath,
} from "./gitleaks-invocation.ts";

const summaryReport = "test-results/security-secrets/report.json";

describe("gitleaks invocation", () => {
  it("names the product config explicitly instead of relying on root discovery", () => {
    const { command, args } = nativeGitleaksInvocation({ config: productGitleaksConfigPath, reportPath: summaryReport });

    assert.equal(command, "gitleaks");
    const configIndex = args.indexOf("--config");
    assert.notEqual(configIndex, -1, "the scan must state which config it ran with");
    assert.equal(args[configIndex + 1], productGitleaksConfigPath);
  });

  it("keeps the engine report beside the summary instead of overwriting it", () => {
    const enginePath = gitleaksEngineReportPath(summaryReport);
    const { args } = nativeGitleaksInvocation({ config: productGitleaksConfigPath, reportPath: summaryReport });

    // The summary is written to `reportPath` after the engine runs, so pointing gitleaks at the same
    // file discarded every finding detail it had just recorded.
    assert.notEqual(enginePath, summaryReport);
    assert.equal(enginePath, "test-results/security-secrets/report.gitleaks.json");
    assert.equal(args[args.indexOf("--report-path") + 1], enginePath);
  });

  it("reports the same evidence from the container as from the host", () => {
    const native = nativeGitleaksInvocation({ config: productGitleaksConfigPath, reportPath: summaryReport });
    const docker = dockerGitleaksInvocation({
      config: productGitleaksConfigPath,
      image: "zricethezav/gitleaks:v8.30.0",
      reportPath: summaryReport,
      workspace: "/host/repo",
    });

    assert.equal(docker.command, "docker");
    assert.deepEqual(docker.args.slice(0, 7), ["run", "--rm", "-v", "/host/repo:/repo", "-w", "/repo", "zricethezav/gitleaks:v8.30.0"]);
    // `--redact` and `--no-git` are the parts that must not diverge between the two branches, and
    // the container branch used to report nothing at all because it was given no report path.
    for (const flag of ["--redact", "--no-git", "--report-format"]) {
      assert.ok(docker.args.includes(flag), `the container branch dropped ${flag}`);
      assert.ok(native.args.includes(flag), `the host branch dropped ${flag}`);
    }
    assert.equal(docker.args[docker.args.indexOf("--config") + 1], `/repo/${productGitleaksConfigPath}`);
    assert.equal(docker.args[docker.args.indexOf("--report-path") + 1], `/repo/${gitleaksEngineReportPath(summaryReport)}`);
  });

  it("sets the container working directory so a relative extend path resolves", () => {
    const { args } = dockerGitleaksInvocation({
      config: productGitleaksConfigPath,
      image: "image",
      reportPath: summaryReport,
      workspace: "/host/repo",
    });

    // gitleaks resolves `[extend] path` against the invocation directory, not against the config
    // file, so a container left in `/` would silently lose every base rule and allowlist.
    assert.equal(args[args.indexOf("-w") + 1], "/repo");
  });

  it("scans both branches from the same relative source so anchored allowlists match", () => {
    const native = nativeGitleaksInvocation({ config: productGitleaksConfigPath, reportPath: summaryReport });
    const docker = dockerGitleaksInvocation({
      config: productGitleaksConfigPath,
      image: "image",
      reportPath: summaryReport,
      workspace: "/host/repo",
    });

    // gitleaks reports a finding's path relative to `--source`, and every fixture allowlist in the
    // base config anchors its path with `^`. Scanning the container from `/repo` reported
    // `/repo/libs/...`, which no anchored pattern matches, so the container branch re-reported every
    // allowlisted fixture as a leak while the host branch stayed clean. The working directory is
    // already the workspace, so `.` names the same tree without moving the paths.
    assert.equal(docker.args[docker.args.indexOf("--source") + 1], ".");
    assert.equal(native.args[native.args.indexOf("--source") + 1], ".");
  });

  it("refuses a path it cannot rewrite into the container", () => {
    for (const config of ["/etc/gitleaks.toml", "../gitleaks.toml", ""]) {
      assert.throws(
        () => dockerGitleaksInvocation({ config, image: "image", reportPath: summaryReport, workspace: "/host/repo" }),
        /workspace-relative/u,
        `accepted the unrewritable config path "${config}"`,
      );
    }
    assert.throws(
      () => dockerGitleaksInvocation({ config: productGitleaksConfigPath, image: "image", reportPath: "/tmp/report.json", workspace: "/host/repo" }),
      /workspace-relative/u,
    );
  });

  it("composes the product config over the boilerplate base rather than replacing it", () => {
    const product = readFileSync(join(workspaceRoot, productGitleaksConfigPath), "utf8");
    const base = readFileSync(join(workspaceRoot, baseGitleaksConfigPath), "utf8");

    assert.ok(product.includes(`path = "${baseGitleaksConfigPath}"`), `${productGitleaksConfigPath} does not extend ${baseGitleaksConfigPath}`);
    // Only one of `path` and `useDefault` is allowed per config, and the default rules reach the
    // product config through the base. Declaring `useDefault` here would drop the base entirely.
    assert.doesNotMatch(product, /^\s*useDefault/mu);
    assert.match(base, /^\s*useDefault\s*=\s*true/mu);
  });
});
