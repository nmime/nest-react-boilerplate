/// <reference types="vitest" />
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import { defineConfig } from "vitest/config";
import { fullCoverage } from "../../../../../packages/tooling/scripts/src/vitest-coverage.mts";

export default defineConfig({
  cacheDir:
    "../../../../../node_modules/.vitest/out-tsc/libs/feature/user/shared",
  plugins: [nxViteTsPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    globals: false,
    coverage: fullCoverage(
      "../../../../../coverage/libs/feature/user/shared",
      ["src/**/*.ts"],
      [],
    ),
  },
});
