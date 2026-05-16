/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { fullCoverage } from "../../../../tools/vitest-coverage.mts";

export default defineConfig({
  cacheDir: "node_modules/.vitest/out-tsc/libs/features/auth/shared",
  resolve: {
    alias: {
      "@app/common/shared": new URL(
        "../../../../libs/common/shared/src/index.ts",
        import.meta.url,
      ).pathname,
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    globals: false,
    coverage: fullCoverage(
      "../../../../coverage/libs/features/auth/shared",
      ["src/**/*.ts"],
      [],
    ),
  },
});
