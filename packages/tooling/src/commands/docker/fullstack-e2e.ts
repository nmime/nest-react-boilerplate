#!/usr/bin/env node
import { resolve } from "node:path";
import { run, skipWhenDockerUnavailable } from "./runtime.ts";
import { loadCurrentSelectedClosure } from "../../runtime/deployment-artifact.ts";

const generatedPortBase =
  Number.parseInt(process.env.DOCKER_TEST_PORT_BASE ?? "", 10) ||
  40_000 + (process.pid % 8_000);
const composeProjectName =
  process.env.COMPOSE_PROJECT_NAME ?? `nrbfullstack${process.pid}`;

const env = {
  ...process.env,
  COMPOSE_PROJECT_NAME: composeProjectName,
  DOCKER_TEST_PORT_BASE: String(generatedPortBase),
  COMPOSE_PARALLEL_LIMIT: process.env.COMPOSE_PARALLEL_LIMIT ?? "1",
  COMPOSE_BAKE: process.env.COMPOSE_BAKE ?? "false",
  DOCKER_BUILDKIT: process.env.DOCKER_BUILDKIT ?? "1",
  NX_DAEMON: "false",
  NX_PARALLEL: process.env.NX_PARALLEL ?? "1",
  NRB_CLOSURE_CONTEXT: resolve(process.cwd(), ".nrb/closure"),
};

const { closure } = await loadCurrentSelectedClosure(process.cwd());
if (!closure.roots.includes("fullstack-e2e")) {
  throw new Error("Fullstack e2e requires fullstack-e2e in the fresh selected closure.");
}

if (await skipWhenDockerUnavailable("fullstack e2e")) process.exit(0);
console.log(
  `fullstack e2e project=${composeProjectName} portBase=${generatedPortBase}`,
);
await run("pnpm", ["exec", "nx", "e2e", "fullstack-e2e"], {
  stdio: "inherit",
  env,
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
