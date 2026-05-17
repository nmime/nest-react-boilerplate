/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { fullCoverage } from "../../../../tools/vitest-coverage.mts";

export default defineConfig({
  cacheDir: "node_modules/.vitest/out-tsc/libs/feature/auth/main",
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
      "@app/common/shared": new URL(
        "../../../../libs/common/shared/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/common/response": new URL(
        "../../../../libs/common/response/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/feature-auth-oauth": new URL(
        "../../../../libs/feature/auth/oauth/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/feature-auth-shared": new URL(
        "../../../../libs/feature/auth/shared/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/feature-admin-shared": new URL(
        "../../../../libs/feature/admin/shared/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/postgres-main": new URL(
        "../../../../libs/postgres/main/shared/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/postgres-main-auth": new URL(
        "../../../../libs/postgres/main/auth/src/index.ts",
        import.meta.url,
      ).pathname,
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    globals: false,
    coverage: fullCoverage(
      "../../../../coverage/libs/feature/auth/main",
      ["src/**/*.ts"],
      ["src/index.ts"],
    ),
  },
});
