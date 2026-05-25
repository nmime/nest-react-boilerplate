/// <reference types="vitest" />
import { defineConfig } from "vitest/config";

export default defineConfig({
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
      "@app/common/validation": new URL(
        "../../../../libs/common/validation/lib/src/index.ts",
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
      "@app/common-component-test": new URL(
        "../../../../libs/common/component-test/lib/src/index.ts",
        import.meta.url,
      ).pathname,
    },
  },
  cacheDir: "../../../../dist/out-tsc/libs/feature/auth/main-component",
  test: {
    environment: "node",
    include: ["lib/src/**/*.postgres.component-spec.ts"],
    globals: false,
    hookTimeout: 180_000,
    testTimeout: 180_000,
    coverage: {
      enabled: false,
      provider: "v8",
      reportsDirectory: "../../../../coverage/libs/feature/auth/main-component",
      reporter: ["text", "lcov"],
      include: ["lib/src/lib/**/*.{ts,tsx}"],
      exclude: ["lib/lib/src/**/*.spec.ts", "lib/src/**/*.component-spec.ts"],
    },
  },
});
