/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { fullCoverage } from "../../../packages/tooling/scripts/src/vitest-coverage.mts";

export default defineConfig({
  cacheDir: "../../../node_modules/.vitest/apps/backend/admin-app-api",
  resolve: {
    alias: {
      "@app/common/i18n": new URL(
        "../../../libs/common/i18n/lib/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/common/exception": new URL(
        "../../../libs/common/exception/lib/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/common/bootstrap": new URL(
        "../../../libs/common/bootstrap/lib/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/common/response": new URL(
        "../../../libs/common/response/lib/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/common/swagger": new URL(
        "../../../libs/common/swagger/lib/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/common/validation": new URL(
        "../../../libs/common/validation/lib/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/common/shared": new URL(
        "../../../libs/common/shared/lib/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/feature-admin-main": new URL(
        "../../../libs/feature/admin/main/lib/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/feature-admin-shared": new URL(
        "../../../libs/feature/admin/shared/lib/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/feature-auth-main": new URL(
        "../../../libs/feature/auth/main/lib/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/feature-auth-shared": new URL(
        "../../../libs/feature/auth/shared/lib/src/index.ts",
        import.meta.url,
      ).pathname,
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts", "src/**/*.e2e-spec.ts"],
    globals: false,
    coverage: fullCoverage(
      "../../../coverage/apps/backend/admin-app-api",
      ["src/**/*.ts"],
      [],
    ),
  },
});
