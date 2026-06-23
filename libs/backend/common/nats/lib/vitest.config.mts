/// <reference types="vitest" />
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";
// nx-ignore-next-line
import { fullCoverage } from "../../../../../packages/tooling/src/testing/vitest-coverage.mts";

export default defineConfig({
  plugins: [tsconfigPaths()],
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
