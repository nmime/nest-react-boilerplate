/// <reference types="vitest" />
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import { defineConfig } from "vitest/config";
import { fullCoverage } from "../../../../../../config/vitest-coverage.mts";

export default defineConfig({
  plugins: [nxViteTsPaths()],
  cacheDir: "../../../../../../dist/out-tsc/libs/backend/postgres/main/shared",
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    globals: false,
    coverage: fullCoverage(
      "../../../../../../coverage/libs/backend/postgres/main/shared",
      ["src/**/*.ts"],
      [],
    ),
  },
});
