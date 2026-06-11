#!/usr/bin/env node
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const modeArg = process.argv.find((arg) => arg.startsWith("--mode="));
const mode =
  modeArg?.split("=", 2)[1] ?? process.env.DEPLOY_VALIDATE_MODE ?? "all";
const requireHelm =
  mode === "helm" ||
  process.argv.includes("--require-helm") ||
  process.env.REQUIRE_HELM === "true";
const supportedModes = new Set(["all", "docker", "helm", "gitops", "pm2"]);

if (!supportedModes.has(mode)) {
  console.error(
    `Unsupported deployment validation mode: ${mode}. Expected one of: ${[
      ...supportedModes,
    ].join(", ")}.`,
  );
  process.exit(2);
}

const run = (label, command, args, options = {}) => {
  console.log(`==> ${label}`);
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    shell: false,
    ...options,
  });
  if (result.error) {
    console.error(`${label} failed to start: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const commandExists = (command) =>
  spawnSync("sh", ["-c", `command -v ${command} >/dev/null 2>&1`], {
    cwd: rootDir,
    stdio: "ignore",
  }).status === 0;

const hasAny = (paths) => paths.some((path) => existsSync(join(rootDir, path)));

const validateDocker = () => {
  run("Docker/static deployment config", process.execPath, [
    "scripts/validate-deployment-config.mjs",
    "--mode=docker",
  ]);
  run("Docker Compose production config", process.execPath, [
    "scripts/validate-docker-compose-prod.mjs",
  ]);
};

const validateHelm = () => {
  if (!existsSync(join(rootDir, ".helm"))) {
    console.error("Helm mode selected but .helm/ chart directory is missing.");
    process.exit(1);
  }

  run("Helm/static deployment config", process.execPath, [
    "scripts/validate-deployment-config.mjs",
    "--mode=helm",
  ]);
  run("Helm rate-limit static config", process.execPath, [
    "scripts/validate-helm-rate-limit-config.mjs",
  ]);

  if (commandExists("helm")) {
    run("Helm render validation", "bash", ["scripts/validate-helm.sh"]);
    return;
  }

  if (requireHelm) {
    console.error(
      "Helm executable not found; Helm render validation is required for --mode=helm or REQUIRE_HELM=true. Install Helm 3 or use a non-Helm validation mode.",
    );
    process.exit(127);
  }

  console.log(
    "Helm executable not found; skipping Helm render validation because Helm is optional for generic deployment validation. Set REQUIRE_HELM=true or run --mode=helm to require it.",
  );
};

const validateGitOps = () => {
  const manifest = "deploy/argocd/application.yaml";
  if (!existsSync(join(rootDir, manifest))) {
    if (mode === "gitops") {
      console.error(`GitOps mode selected but ${manifest} is missing.`);
      process.exit(1);
    }
    console.log(
      "GitOps/Argo validation skipped: deploy/argocd/application.yaml not present.",
    );
    return;
  }
  run("GitOps/Argo static config", process.execPath, [
    "scripts/validate-gitops-config.mjs",
  ]);
};

const validatePm2 = () => {
  const pm2Configs = [
    "ecosystem.config.js",
    "ecosystem.config.cjs",
    "ecosystem.config.mjs",
  ];
  if (!hasAny(pm2Configs)) {
    console.log(
      "PM2 validation skipped: no ecosystem.config.{js,cjs,mjs} file is present for this optional deployment mode.",
    );
    return;
  }
  run("PM2 static config", process.execPath, [
    "scripts/validate-pm2-config.mjs",
  ]);
};

if (mode === "docker") {
  validateDocker();
} else if (mode === "helm") {
  validateHelm();
} else if (mode === "gitops") {
  validateGitOps();
} else if (mode === "pm2") {
  validatePm2();
} else {
  validateDocker();
  validateHelm();
  validateGitOps();
  validatePm2();
}

console.log(`deployment validation passed (${mode} mode)`);
