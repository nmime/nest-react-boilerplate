/// <reference types="vitest" />
import { defineConfig } from "vitest/config";

export default defineConfig({
  cacheDir: "../../../node_modules/.vitest/apps/backend/user-app-api-e2e",
  resolve: {
    alias: {
      "@app/common/feature-flags": new URL(
        "../../../libs/backend/common/feature-flags/lib/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/common-config": new URL(
        "../../../libs/common/config/lib/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/common/i18n": new URL(
        "../../../libs/common/i18n/lib/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/common/network": new URL(
        "../../../libs/backend/common/network/lib/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/common/redis": new URL(
        "../../../libs/backend/common/redis/lib/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/common/nats": new URL(
        "../../../libs/backend/common/nats/lib/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/common/exception": new URL(
        "../../../libs/backend/common/exception/lib/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/common/shared": new URL(
        "../../../libs/backend/common/shared/lib/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/common/bootstrap": new URL(
        "../../../libs/backend/common/bootstrap/lib/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/common/response": new URL(
        "../../../libs/backend/common/response/lib/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/common/swagger": new URL(
        "../../../libs/backend/common/swagger/lib/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/common/health": new URL(
        "../../../libs/backend/common/health/lib/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/common/validation": new URL(
        "../../../libs/backend/common/validation/lib/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/feature-auth-main": new URL(
        "../../../libs/backend/feature/auth/main/lib/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/feature-auth-shared": new URL(
        "../../../libs/backend/feature/auth/shared/lib/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/feature-user-main": new URL(
        "../../../libs/backend/feature/user/main/lib/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/feature-user-shared": new URL(
        "../../../libs/backend/feature/user/shared/lib/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/postgres-main": new URL(
        "../../../libs/backend/postgres/main/shared/lib/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/postgres-main-feature-flags": new URL(
        "../../../libs/backend/postgres/main/feature-flags/lib/src/index.ts",
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
      reportsDirectory: "../../../coverage/e2e/apps/backend/user-app-api",
      reporter: ["text", "lcov", "json"],
      include: [
        "src/**/*.ts",
        "../../../libs/backend/common/response/lib/src/**/*.ts",
        "../../../libs/backend/common/validation/lib/src/**/*.ts",
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
