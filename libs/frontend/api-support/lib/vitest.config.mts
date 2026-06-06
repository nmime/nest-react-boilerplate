import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { fullCoverage } from "../../../../config/vitest-coverage.mts";

export default defineConfig({
  root: import.meta.dirname,
  resolve: {
    alias: {
      "@app/common/i18n": fileURLToPath(
        new URL(
          "../../../../libs/common/i18n/lib/src/index.ts",
          import.meta.url,
        ),
      ),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    passWithNoTests: false,
    coverage: fullCoverage("../../../../coverage/libs/frontend/api-support", [
      "src/lib/**/*.ts",
    ]),
  },
});
