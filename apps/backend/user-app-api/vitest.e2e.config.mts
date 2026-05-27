/// <reference types="vitest" />
import { defineConfig } from "vitest/config";

export default defineConfig({
  cacheDir: "../../../node_modules/.vitest/apps/backend/user-app-api-e2e",
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
      "@app/common/shared": new URL(
        "../../../libs/common/shared/lib/src/index.ts",
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
      "@app/feature-auth-main": new URL(
        "../../../libs/feature/auth/main/lib/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/feature-auth-shared": new URL(
        "../../../libs/feature/auth/shared/lib/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/feature-user-main": new URL(
        "../../../libs/feature/user/main/lib/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/feature-user-shared": new URL(
        "../../../libs/feature/user/shared/lib/src/index.ts",
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
        "../../../libs/common/response/lib/src/**/*.ts",
        "../../../libs/common/validation/lib/src/**/*.ts",
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
