import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { fullCoverage } from "../../../../config/vitest-coverage.mts";

export default defineConfig({
  resolve: {
    alias: {
      "@app/common/i18n": fileURLToPath(
        new URL(
          "../../../../libs/common/i18n/lib/src/index.ts",
          import.meta.url,
        ),
      ),
      "@app/frontend-ui": fileURLToPath(
        new URL(
          "../../../../libs/frontend/ui/lib/src/index.ts",
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
