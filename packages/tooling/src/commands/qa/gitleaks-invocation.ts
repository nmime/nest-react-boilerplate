/**
 * How this repository invokes gitleaks, in one place, because the host and container branches have
 * to agree. They are the same gate reached two ways: a divergence between them is a gate that
 * reports different things depending on what happens to be installed.
 */

/**
 * The product-owned config. It extends the base below, which extends the gitleaks defaults; a
 * product adds its own fixture allowlists here and never edits the base.
 */
export const productGitleaksConfigPath = ".gitleaks.toml";

/** The boilerplate-owned config, rewritten on every upstream sync. */
export const baseGitleaksConfigPath = "packages/tooling/config/gitleaks.base.toml";

/** Where the container sees the workspace. Also its working directory — see below. */
const containerWorkspace = "/repo";

export interface GitleaksInvocation {
  command: string;
  args: string[];
}

export interface GitleaksInvocationOptions {
  /** Workspace-relative path to the config gitleaks should load. */
  config: string;
  /** Workspace-relative path the scan writes its own summary to; the engine report goes beside it. */
  reportPath: string;
}

export interface DockerGitleaksInvocationOptions extends GitleaksInvocationOptions {
  image: string;
  /** Absolute host path mounted into the container. */
  workspace: string;
}

/**
 * The engine's own report, next to the summary rather than on top of it.
 *
 * The scan writes its summary to `reportPath` after the engine returns, so pointing gitleaks at the
 * same file threw away every finding detail it had just recorded.
 */
export function gitleaksEngineReportPath(reportPath: string) {
  return `${reportPath.replace(/\.json$/u, "")}.gitleaks.json`;
}

function detectArgs(source: string, config: string, reportPath: string) {
  return ["detect", "--source", source, "--config", config, "--redact", "--no-git", "--report-format", "json", "--report-path", reportPath];
}

export function nativeGitleaksInvocation({ config, reportPath }: GitleaksInvocationOptions): GitleaksInvocation {
  return { command: "gitleaks", args: detectArgs(".", config, gitleaksEngineReportPath(reportPath)) };
}

function containerPath(path: string, label: string) {
  if (path === "" || path.startsWith("/") || path.split("/").includes("..")) {
    throw new Error(`The gitleaks ${label} "${path}" must be a workspace-relative path; it is rewritten into the container.`);
  }
  return `${containerWorkspace}/${path}`;
}

export function dockerGitleaksInvocation({ config, image, reportPath, workspace }: DockerGitleaksInvocationOptions): GitleaksInvocation {
  const containerConfig = containerPath(config, "config");
  const containerReport = containerPath(gitleaksEngineReportPath(reportPath), "report path");
  return {
    command: "docker",
    args: [
      "run",
      "--rm",
      "-v",
      `${workspace}:${containerWorkspace}`,
      // gitleaks resolves a config's `[extend] path` against the directory it was invoked from, not
      // against the config file. Without this the container would load the product config, fail to
      // find the base beside it, and scan with neither the base rules nor its allowlists.
      "-w",
      containerWorkspace,
      image,
      // `.`, not the mount point: gitleaks reports a finding's path relative to `--source`, and every
      // fixture allowlist anchors its path with `^`. Scanning from `/repo` reported `/repo/libs/...`,
      // which no anchored pattern matches, so the container branch re-reported every allowlisted
      // fixture as a leak. The working directory is already the workspace.
      ...detectArgs(".", containerConfig, containerReport),
    ],
  };
}
