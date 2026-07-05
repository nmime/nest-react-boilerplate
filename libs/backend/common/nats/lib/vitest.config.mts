/// <reference types="vitest" />
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import { defineConfig } from "vitest/config";
// nx-ignore-next-line
import { fullCoverage } from "../../../../../packages/tooling/src/testing/vitest-coverage.mts";

export default defineConfig({
  plugins: [nxViteTsPaths()],
  cacheDir: "../../../../../node_modules/.vitest/libs/backend/common/nats/lib",
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    globals: false,
    pool: "threads",
    maxWorkers: 1,
    testTimeout: 30_000,
    coverage: fullCoverage(
      "../../../../coverage/libs/backend/common/nats/lib",
      ["src/**/*.ts"],
      [],
    ),
  },
});
