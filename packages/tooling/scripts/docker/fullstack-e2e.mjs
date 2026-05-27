#!/usr/bin/env node
import { run, skipWhenDockerUnavailable } from "./runtime.mjs";
const env = { ...process.env, COMPOSE_PARALLEL_LIMIT: process.env.COMPOSE_PARALLEL_LIMIT ?? "1", COMPOSE_BAKE: process.env.COMPOSE_BAKE ?? "false", DOCKER_BUILDKIT: process.env.DOCKER_BUILDKIT ?? "1", NX_DAEMON: "false", NX_PARALLEL: process.env.NX_PARALLEL ?? "1" };
if (await skipWhenDockerUnavailable("fullstack e2e")) process.exit(0);
await run("pnpm", ["exec", "nx", "e2e", "fullstack-e2e"], { stdio: "inherit", env }).catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
