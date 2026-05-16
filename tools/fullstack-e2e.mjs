#!/usr/bin/env node
import { run, skipWhenDockerUnavailable } from "./docker-runtime.mjs";

if (await skipWhenDockerUnavailable("fullstack e2e")) {
  process.exit(0);
}

await run("pnpm", ["exec", "nx", "e2e", "fullstack-e2e"], {
  stdio: "inherit",
  env: process.env,
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
