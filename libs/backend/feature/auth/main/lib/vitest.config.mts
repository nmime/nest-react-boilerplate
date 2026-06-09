/// <reference types="vitest" />
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import { defineConfig } from "vitest/config";
import { fullCoverage } from "../../../../../../config/vitest-coverage.mts";

export default defineConfig({
  cacheDir:
    "../../../../../../node_modules/.vitest/out-tsc/libs/backend/feature/auth/main",
  plugins: [nxViteTsPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    globals: false,
    coverage: fullCoverage(
      "../../../../../../coverage/libs/backend/feature/auth/main",
      ["src/**/*.ts"],
      ["src/index.ts"],
    ),
  },
});
