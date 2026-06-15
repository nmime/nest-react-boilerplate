/// <reference types="vitest" />
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import { defineConfig } from "vitest/config";
// nx-ignore-next-line
import { fullCoverage } from "../../../packages/tooling/src/testing/vitest-coverage.mts";

export default defineConfig({
  cacheDir: "../../../node_modules/.vitest/apps/backend/telegram-bot-api",
  plugins: [nxViteTsPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    globals: false,
    coverage: fullCoverage(
      "../../../coverage/apps/backend/telegram-bot-api",
      ["src/**/*.ts"],
      [],
    ),
  },
});
