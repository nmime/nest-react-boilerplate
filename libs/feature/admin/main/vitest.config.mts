/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { fullCoverage } from "../../../../tools/vitest-coverage.mts";

export default defineConfig({
  cacheDir: "node_modules/.vitest/out-tsc/libs/feature/admin/main",
  resolve: {
    alias: {
      "@app/common/i18n": new URL(
        "../../../../libs/common/i18n/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/common/exception": new URL(
        "../../../../libs/common/exception/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/common/response": new URL(
        "../../../../libs/common/response/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/common/shared": new URL(
        "../../../../libs/common/shared/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/feature-admin-shared": new URL(
        "../../../../libs/feature/admin/shared/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/feature-auth-oauth": new URL(
        "../../../../libs/feature/auth/oauth/src/index.ts",
        import.meta.url,
      ).pathname,
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    globals: false,
    coverage: fullCoverage(
      "../../../../coverage/libs/feature/admin/main",
      ["src/lib/**/*.ts"],
      ["src/**/*.module.ts"],
    ),
  },
});
