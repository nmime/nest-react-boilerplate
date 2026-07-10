/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { workspaceTsconfigAliases } from "../../../../../../config/vite/workspace-tsconfig-aliases.mjs";
// nx-ignore-next-line
import { fullCoverage } from "../../../../../../packages/tooling/src/testing/vitest-coverage.mts";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: workspaceTsconfigAliases(),
  },
  cacheDir:
    "../../../../../../node_modules/.vitest/libs/backend/feature/auth/shared/lib",
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    globals: false,
    env: { NODE_ENV: "test" },
    coverage: fullCoverage(
      "../../../../coverage/libs/backend/feature/auth/shared/lib",
      ["src/**/*.ts"],
      [],
    ),
  },
});
