/// <reference types="vitest" />
import { defineConfig } from "vitest/config";

export default defineConfig({
  cacheDir: "../../../node_modules/.vitest/apps/backend/auth-app-api-e2e",
  resolve: {
    alias: {
      "@app/common/exception": new URL(
        "../../../libs/common/exception/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/common/shared": new URL(
        "../../../libs/common/shared/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/common/bootstrap": new URL(
        "../../../libs/common/bootstrap/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/common/response": new URL(
        "../../../libs/common/response/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/common/validation": new URL(
        "../../../libs/common/validation/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/feature-auth-oauth": new URL(
        "../../../libs/feature/auth/oauth/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/feature-auth-main": new URL(
        "../../../libs/feature/auth/main/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/feature-auth-shared": new URL(
        "../../../libs/feature/auth/shared/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/feature-admin-shared": new URL(
        "../../../libs/feature/admin/shared/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/postgres-main": new URL(
        "../../../libs/postgres/main/shared/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/postgres-main-auth": new URL(
        "../../../libs/postgres/main/auth/src/index.ts",
        import.meta.url,
      ).pathname,
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.e2e-spec.ts"],
    globals: false,
    coverage: {
      enabled: true,
      provider: "v8",
      reportsDirectory: "../../../coverage/e2e/apps/backend/auth-app-api",
      reporter: ["text", "lcov", "json"],
      include: [
        "src/**/*.ts",
        "../../../libs/common/response/src/**/*.ts",
        "../../../libs/common/validation/src/**/*.ts",
      ],
      exclude: [
        "src/main.ts",
        "src/**/*.spec.ts",
        "src/**/*.e2e-spec.ts",
        "src/**/*.component-spec.ts",
        "**/index.ts",
      ],
    },
  },
});
