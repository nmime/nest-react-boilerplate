/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { fullCoverage } from "../../../tools/vitest-coverage.mts";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: "../../../node_modules/.vitest/libs/frontend/api-client",
  plugins: [nxViteTsPaths()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.spec.ts"],
    passWithNoTests: false,
    coverage: fullCoverage(
      "../../../coverage/libs/frontend/api-client",
      ["src/lib/**/*.ts"],
      [],
    ),
  },
});
