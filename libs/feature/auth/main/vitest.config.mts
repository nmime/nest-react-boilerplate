/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { fullCoverage } from "../../../../tools/vitest-coverage.mts";

export default defineConfig({
  cacheDir: "node_modules/.vitest/out-tsc/libs/feature/auth/main",
  resolve: {
    alias: {
      "@app/common/i18n": new URL(
        "../../../../libs/common/i18n/lib/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/common/exception": new URL(
        "../../../../libs/common/exception/lib/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/common/shared": new URL(
        "../../../../libs/common/shared/lib/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/common/response": new URL(
        "../../../../libs/common/response/lib/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/common/swagger": new URL(
        "../../../../libs/common/swagger/lib/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/feature-auth-oauth": new URL(
        "../../../../libs/feature/auth/oauth/lib/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/feature-auth-shared": new URL(
        "../../../../libs/feature/auth/shared/lib/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/feature-admin-shared": new URL(
        "../../../../libs/feature/admin/shared/lib/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/postgres-main": new URL(
        "../../../../libs/postgres/main/shared/lib/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/postgres-main-auth": new URL(
        "../../../../libs/postgres/main/auth/lib/src/index.ts",
        import.meta.url,
      ).pathname,
    },
  },
  test: {
    environment: "node",
    include: ["lib/src/**/*.spec.ts"],
    globals: false,
    coverage: fullCoverage(
      "../../../../coverage/libs/feature/auth/main",
      ["lib/src/**/*.ts"],
      ["lib/src/index.ts"],
    ),
  },
});
