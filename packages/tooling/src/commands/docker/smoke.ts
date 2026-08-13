#!/usr/bin/env node
import { run, skipWhenDockerUnavailable } from "./runtime.ts";
import { smokeProbes } from "./smoke-probes.ts";

const composeParallelLimit = process.env.COMPOSE_PARALLEL_LIMIT ?? "2";
const compose = [
  "compose",
  "--parallel",
  composeParallelLimit,
  "-f",
  "docker/docker-compose.yml",
];
const backendServices = [
  "admin-app-api",
  "user-app-api",
  "auth-app-api",
];
const frontendServices = [
  "admin-app",
  "user-app",
  "landing-app",
  "site-app",
  "mobile-app",
];
const stackServices = ["migrate", ...backendServices, ...frontendServices];
const host = process.env.DOCKER_SMOKE_HOST ?? "127.0.0.1";
const generatedPortBase =
  Number.parseInt(process.env.DOCKER_TEST_PORT_BASE ?? "", 10) ||
  30_000 + (process.pid % 10_000);
const pickPort = (envName: string, offset: number): string =>
  process.env[envName] ?? String(generatedPortBase + offset);
const ports = {
  postgres: pickPort("POSTGRES_PORT", 0),
  redis: pickPort("REDIS_PORT", 4),
  adminApi: pickPort("ADMIN_APP_API_PORT", 1),
  userApi: pickPort("USER_APP_API_PORT", 2),
  authApi: pickPort("AUTH_APP_API_PORT", 3),
  adminApp: pickPort("ADMIN_APP_PORT", 81),
  userApp: pickPort("USER_APP_PORT", 82),
  landingApp: pickPort("LANDING_APP_PORT", 83),
  siteApp: pickPort("SITE_APP_PORT", 84),
  mobileApp: pickPort("MOBILE_APP_PORT", 85),
};
const url = (port: string, path = ""): string => `http://${host}:${port}${path}`;
const frontendOrigins = [
  ports.adminApp,
  ports.userApp,
  ports.landingApp,
  ports.siteApp,
  ports.mobileApp,
]
  .map((port) => url(port))
  .join(",");
const postgresUser = process.env.POSTGRES_USER || "postgres";
const postgresPassword = process.env.POSTGRES_PASSWORD || "postgres";
const postgresDatabase = process.env.POSTGRES_DB || "nest_react_boilerplate";
const containerDatabaseUrl =
  `postgres://${encodeURIComponent(postgresUser)}:${encodeURIComponent(postgresPassword)}` +
  `@postgres:5432/${encodeURIComponent(postgresDatabase)}`;
const env = {
  ...process.env,
  HOST: process.env.DOCKER_BACKEND_HOST ?? "0.0.0.0",
  DATABASE_ENGINE: "postgres",
  AUTH_PERSISTENCE: "postgres",
  CONTAINER_DATABASE_URL: containerDatabaseUrl,
  COMPOSE_PROJECT_NAME:
    process.env.COMPOSE_PROJECT_NAME ?? `nrbsmoke${process.pid}`,
  POSTGRES_PORT: ports.postgres,
  REDIS_PORT: ports.redis,
  ADMIN_APP_API_PORT: ports.adminApi,
  USER_APP_API_PORT: ports.userApi,
  AUTH_APP_API_PORT: ports.authApi,
  ADMIN_APP_PORT: ports.adminApp,
  USER_APP_PORT: ports.userApp,
  LANDING_APP_PORT: ports.landingApp,
  SITE_APP_PORT: ports.siteApp,
  MOBILE_APP_PORT: ports.mobileApp,
  COMPOSE_PROFILES:
    process.env.COMPOSE_PROFILES ??
    ['postgres', 'redis', ...backendServices, ...frontendServices].join(','),
  // Keep memory bounded while allowing independent image targets to share the
  // BuildKit dependency layers during a single Compose invocation.
  COMPOSE_PARALLEL_LIMIT: composeParallelLimit,
  COMPOSE_BAKE: process.env.COMPOSE_BAKE ?? "false",
  DOCKER_BUILDKIT: process.env.DOCKER_BUILDKIT ?? "1",
  NX_DAEMON: "false",
  NX_PARALLEL: process.env.NX_PARALLEL ?? "1",
  CORS_ORIGINS: process.env.CORS_ORIGINS ?? frontendOrigins,
  SESSION_SECRET:
    process.env.SESSION_SECRET ?? "docker-smoke-session-secret-change-me",
};
const probes = smokeProbes.map((probe) => ({
  ...probe,
  url: url(ports[probe.port], probe.path),
}));

async function logComposeDiagnostics(label: string): Promise<void> {
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

async function composeUpServices(label: string, services: string[]): Promise<void> {
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

async function buildServices(services: string[]): Promise<void> {
  const args = [...compose, 'build', ...services];
  try {
    await run('docker', args, { stdio: 'inherit', env });
  } catch (error) {
    console.warn(
      `docker compose parallel build reported a transient failure; retrying once: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    await new Promise((resolve) => setTimeout(resolve, 5000));
    await run('docker', args, { stdio: 'inherit', env });
  }
}

async function composeUp() {
  await run("docker", [...compose, "up", "--no-build", "-d", "postgres", "redis"], {
    stdio: "inherit",
    env,
  });
  await run("docker", [...compose, "up", "--no-build", "migrate"], {
    stdio: "inherit",
    env,
  });
  await composeUpServices("backend", backendServices);
}

async function waitForProbe({
  name,
  url: probeUrl,
  marker: contains,
  status: expectedStatus,
}: (typeof probes)[number]): Promise<void> {
  const started = Date.now();
  let lastError = "not attempted";
  while (Date.now() - started < 180_000) {
    try {
      const response = await fetch(probeUrl);
      const text = await response.text();
      if (response.status === expectedStatus && text.includes(contains)) {
        console.log(`${name}: ok (${response.status})`);
        return;
      }
      lastError = `${response.status} (expected ${expectedStatus}) missing expected text`;
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
  await buildServices(stackServices);
  await composeUp();
  for (const probe of probes.filter(({ tier }) => tier === "backend")) await waitForProbe(probe);
  await composeUpServices("frontend", frontendServices);
  for (const probe of probes.filter(({ tier }) => tier === "frontend")) await waitForProbe(probe);
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
