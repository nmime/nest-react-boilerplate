/// <reference types="vitest" />
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";
// nx-ignore-next-line
import { fullCoverage } from "../../../packages/tooling/src/testing/vitest-coverage.mts";

export default defineConfig({
  cacheDir: "../../../node_modules/.vitest/apps/backend/telegram-bot-api",
  plugins: [tsconfigPaths()],
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
