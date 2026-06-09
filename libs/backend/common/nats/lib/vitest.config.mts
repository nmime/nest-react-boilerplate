/// <reference types="vitest" />
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import { defineConfig } from "vitest/config";
import { fullCoverage } from "../../../../../config/vitest-coverage.mts";

export default defineConfig({
  plugins: [nxViteTsPaths()],
  cacheDir: "../../../../../dist/out-tsc/libs/backend/common/nats",
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    globals: false,
    pool: "threads",
    maxWorkers: 1,
    testTimeout: 30_000,
    coverage: fullCoverage(
      "../../../../../coverage/libs/backend/common/nats",
      ["src/**/*.ts"],
      [],
    ),
  },
});
