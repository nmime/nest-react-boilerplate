#!/usr/bin/env node
// @ts-nocheck
import { run, skipWhenDockerUnavailable } from "./runtime.ts";

const compose = ["compose", "-f", "docker/docker-compose.yml"];
const backendServices = [
  "admin-app-api",
  "user-app-api",
  "auth-app-api",
];
const frontendServices = ["admin-app", "user-app", "landing-app"];
const stackServices = ["migrate", ...backendServices, ...frontendServices];
const host = process.env.DOCKER_SMOKE_HOST ?? "127.0.0.1";
const generatedPortBase =
  Number.parseInt(process.env.DOCKER_TEST_PORT_BASE ?? "", 10) ||
  30_000 + (process.pid % 10_000);
const pickPort = (envName, offset) =>
  process.env[envName] ?? String(generatedPortBase + offset);
const ports = {
  postgres: pickPort("POSTGRES_PORT", 0),
  adminApi: pickPort("ADMIN_APP_API_PORT", 1),
  userApi: pickPort("USER_APP_API_PORT", 2),
  authApi: pickPort("AUTH_APP_API_PORT", 3),
  adminApp: pickPort("ADMIN_APP_PORT", 81),
  userApp: pickPort("USER_APP_PORT", 82),
  landingApp: pickPort("LANDING_APP_PORT", 83),
};
const url = (port, path = "") => `http://${host}:${port}${path}`;
const frontendOrigins = [ports.adminApp, ports.userApp, ports.landingApp]
  .map((port) => url(port))
  .join(",");
const env = {
  ...process.env,
  HOST: process.env.DOCKER_BACKEND_HOST ?? "0.0.0.0",
  COMPOSE_PROJECT_NAME:
    process.env.COMPOSE_PROJECT_NAME ?? `nrbsmoke${process.pid}`,
  POSTGRES_PORT: ports.postgres,
  ADMIN_APP_API_PORT: ports.adminApi,
  USER_APP_API_PORT: ports.userApi,
  AUTH_APP_API_PORT: ports.authApi,
  ADMIN_APP_PORT: ports.adminApp,
  USER_APP_PORT: ports.userApp,
  LANDING_APP_PORT: ports.landingApp,
  COMPOSE_PARALLEL_LIMIT: process.env.COMPOSE_PARALLEL_LIMIT ?? "1",
  COMPOSE_BAKE: process.env.COMPOSE_BAKE ?? "false",
  DOCKER_BUILDKIT: process.env.DOCKER_BUILDKIT ?? "1",
  NX_DAEMON: "false",
  NX_PARALLEL: process.env.NX_PARALLEL ?? "1",
  CORS_ORIGINS: process.env.CORS_ORIGINS ?? frontendOrigins,
  AUTH_JWT_SECRET:
    process.env.AUTH_JWT_SECRET ?? "docker-smoke-jwt-secret-change-me",
  AUTH_JWT_ISSUER: process.env.AUTH_JWT_ISSUER ?? "nest-react-boilerplate",
  AUTH_JWT_AUDIENCE:
    process.env.AUTH_JWT_AUDIENCE ?? "nest-react-boilerplate-api",
};
const probes = [
  ["auth health", url(ports.authApi, "/health"), "auth-app-api"],
  ["user health", url(ports.userApi, "/health"), "user-app-api"],
  ["admin health", url(ports.adminApi, "/health"), "admin-app-api"],
  ["admin frontend", url(ports.adminApp, "/"), "Admin App"],
  ["user frontend", url(ports.userApp, "/"), "User App"],
  ["landing frontend", url(ports.landingApp, "/"), "Nest React Boilerplate"],
  ["user proxy auth", url(ports.userApp, "/auth/me"), "Missing bearer token"],
  [
    "admin proxy",
    url(ports.adminApp, "/admin/profile/me"),
    "Missing bearer token",
  ],
];

async function logComposeDiagnostics(label) {
  console.warn(`${label}: docker compose diagnostics`);
  await run("docker", [...compose, "ps", "--all"], {
    stdio: "inherit",
    env,
  }).catch(() => undefined);
  await run(
    "docker",
    [
      ...compose,
      "logs",
      "--no-color",
      "--tail",
      "200",
      "migrate",
      "postgres",
      ...backendServices,
    ],
    { stdio: "inherit", env },
  ).catch(() => undefined);
}

async function composeUpServices(label, services) {
  const args = [...compose, "up", "--no-build", "--no-deps", "-d", ...services];
  try {
    await run("docker", args, { stdio: "inherit", env });
  } catch (error) {
    console.warn(
      `docker compose ${label} startup reported a transient failure; retrying once: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    await logComposeDiagnostics(`docker compose ${label} startup transient failure`);
    await new Promise((resolve) => setTimeout(resolve, 5000));
    await run("docker", args, { stdio: "inherit", env });
  }
}

async function composeUp() {
  await run("docker", [...compose, "up", "--no-build", "-d", "postgres"], {
    stdio: "inherit",
    env,
  });
  await run("docker", [...compose, "up", "--no-build", "migrate"], {
    stdio: "inherit",
    env,
  });
  await composeUpServices("backend", backendServices);
}

async function waitForProbe([name, probeUrl, contains]) {
  const started = Date.now();
  let lastError = "not attempted";
  while (Date.now() - started < 180_000) {
    try {
      const response = await fetch(probeUrl);
      const text = await response.text();
      if (text.includes(contains)) {
        console.log(`${name}: ok (${response.status})`);
        return;
      }
      lastError = `${response.status} missing expected text`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error(`${name} failed for ${probeUrl}: ${lastError}`);
}

let exitCode = 0;
try {
  if (await skipWhenDockerUnavailable("docker smoke")) process.exit(0);
  console.log(
    `docker smoke project=${env.COMPOSE_PROJECT_NAME} ports=${JSON.stringify(ports)}`,
  );
  for (const service of stackServices) {
    await run("docker", [...compose, "build", service], { stdio: "inherit", env });
  }
  await composeUp();
  const backendProbeCount = backendServices.length;
  for (const probe of probes.slice(0, backendProbeCount)) await waitForProbe(probe);
  await composeUpServices("frontend", frontendServices);
  for (const probe of probes.slice(backendProbeCount)) await waitForProbe(probe);
  console.log(JSON.stringify({ status: "ok", probes: probes.length }));
} catch (error) {
  exitCode = 1;
  console.error(error instanceof Error ? error.message : String(error));
  await logComposeDiagnostics("docker smoke failure");
} finally {
  await run("docker", [...compose, "down", "--remove-orphans"], {
    stdio: "inherit",
    env,
  }).catch(() => undefined);
}
process.exit(exitCode);
