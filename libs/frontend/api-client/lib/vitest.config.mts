import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
// nx-ignore-next-line
import { fullCoverage } from "../../../../packages/tooling/src/testing/vitest-coverage.mts";

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
      "@app/frontend-api-support": fileURLToPath(
        new URL(
          "../../../../libs/frontend/api-support/lib/src/index.ts",
          import.meta.url,
        ),
      ),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    passWithNoTests: true,
    coverage: fullCoverage(
      "../../../../coverage/libs/frontend/api-client",
      ["src/lib/**/*.ts"],
      ["src/lib/admin.ts", "src/lib/auth.ts", "src/lib/user.ts"],
    ),
  },
});
