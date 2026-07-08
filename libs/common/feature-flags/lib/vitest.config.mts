/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { workspaceTsconfigAliases } from "../../../../config/vite/workspace-tsconfig-aliases.mjs";
// nx-ignore-next-line
import { fullCoverage } from "../../../../packages/tooling/src/testing/vitest-coverage.mts";

export default defineConfig({
  cacheDir: "../../../../node_modules/.vitest/libs/common/feature-flags/lib",
  resolve: {
    tsconfigPaths: true,
    alias: workspaceTsconfigAliases(),
  },
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    globals: false,
    coverage: fullCoverage(
      "../../../../coverage/libs/common/feature-flags/lib",
      ["src/**/*.ts"],
    ),
  },
});
