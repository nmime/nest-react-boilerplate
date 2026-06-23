/// <reference types="vitest" />
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";
// nx-ignore-next-line
import { fullCoverage } from "../../../../../packages/tooling/src/testing/vitest-coverage.mts";

export default defineConfig({
  plugins: [tsconfigPaths()],
  cacheDir: "../../../../../dist/out-tsc/libs/backend/common/component-test",
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    exclude: ["src/**/*.component-spec.ts"],
    globals: false,
    coverage: fullCoverage(
      "../../../../../coverage/libs/backend/common/component-test",
      ["src/**/*.ts"],
      ["src/index.ts", "src/**/index.ts"],
    ),
  },
});
