#!/usr/bin/env node
import { run, skipWhenDockerUnavailable } from "./docker-runtime.mjs";

const compose = ["compose", "-f", "docker/docker-compose.yml"];
const env = {
  ...process.env,
  AUTH_JWT_SECRET:
    process.env.AUTH_JWT_SECRET ?? "docker-smoke-jwt-secret-change-me",
  AUTH_JWT_ISSUER: process.env.AUTH_JWT_ISSUER ?? "nest-react-boilerplate",
  AUTH_JWT_AUDIENCE:
    process.env.AUTH_JWT_AUDIENCE ?? "nest-react-boilerplate-api",
};

const probes = [
  ["auth health", "http://127.0.0.1:3003/health", "auth-app-api"],
  ["user health", "http://127.0.0.1:3002/health", "user-app-api"],
  ["admin health", "http://127.0.0.1:3001/health", "backend-admin-app-api"],
  ["admin frontend", "http://127.0.0.1:8081/", "Admin App"],
  ["user frontend", "http://127.0.0.1:8082/", "User App"],
  ["landing frontend", "http://127.0.0.1:8083/", "Nest React Boilerplate"],
  ["user proxy auth", "http://127.0.0.1:8082/auth/me", "Missing bearer token"],
  [
    "admin proxy",
    "http://127.0.0.1:8081/admin/profile/me",
    "Missing bearer token",
  ],
];

async function waitForProbe([name, url, contains]) {
  const started = Date.now();
  let lastError = "not attempted";
  while (Date.now() - started < 180_000) {
    try {
      const response = await fetch(url);
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
  throw new Error(`${name} failed for ${url}: ${lastError}`);
}

let exitCode = 0;
try {
  if (await skipWhenDockerUnavailable("docker smoke")) {
    process.exit(0);
  }
  await run("docker", [...compose, "up", "--build", "-d"], {
    stdio: "inherit",
    env,
  });
  for (const probe of probes) {
    await waitForProbe(probe);
  }
  console.log(JSON.stringify({ status: "ok", probes: probes.length }));
} catch (error) {
  exitCode = 1;
  console.error(error instanceof Error ? error.message : String(error));
} finally {
  await run("docker", [...compose, "down", "--remove-orphans"], {
    stdio: "inherit",
    env,
  }).catch(() => undefined);
}
process.exit(exitCode);
