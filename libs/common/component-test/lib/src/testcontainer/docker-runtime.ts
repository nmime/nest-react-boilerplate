import { spawnSync } from "node:child_process";

export interface DockerRuntimeAvailabilityOptions {
  /**
   * Environment variable that lets local and CI callers opt out of Docker-backed
   * helpers. Defaults to SKIP_TESTCONTAINERS.
   */
  skipEnvVar?: string;
  /**
   * Docker CLI paths to try when not running in CI. Keeping these explicit makes
   * macOS/Linux developer hosts work even when PATH differs between shells.
   */
  dockerBinaryPaths?: readonly string[];
}

const DefaultDockerBinaryPaths = [
  "docker",
  "/usr/bin/docker",
  "/usr/local/bin/docker",
  "/opt/homebrew/bin/docker",
] as const;

export function hasDockerRuntime(
  options: DockerRuntimeAvailabilityOptions = {},
): boolean {
  const skipEnvVar = options.skipEnvVar ?? "SKIP_TESTCONTAINERS";

  if (process.env[skipEnvVar] === "true") {
    return false;
  }

  if (process.env.CI === "true") {
    return true;
  }

  return (options.dockerBinaryPaths ?? DefaultDockerBinaryPaths).some(
    (dockerBinaryPath) => {
      try {
        const result = spawnSync(dockerBinaryPath, ["version"], {
          stdio: "ignore",
          timeout: 5_000,
        });
        return result.status === 0;
      } catch {
        return false;
      }
    },
  );
}

export function shouldSkipDockerTest(
  options: DockerRuntimeAvailabilityOptions = {},
): boolean {
  return !hasDockerRuntime(options);
}

/**
 * Vitest/Jest suites that start Testcontainers should guard their Docker-backed
 * cases with this helper instead of probing Docker in every NATS/Redis/Postgres
 * spec independently:
 *
 *   const dockerIt = it.skipIf(shouldSkipDockerTest());
 *   dockerIt("starts the service container", async () => { ... });
 *
 * Container factory unit tests should continue to create container definitions
 * without starting Docker so they remain runnable on Docker-less developer hosts.
 */
export const DockerUnavailableGuardPattern =
  "const dockerIt = it.skipIf(shouldSkipDockerTest());";
