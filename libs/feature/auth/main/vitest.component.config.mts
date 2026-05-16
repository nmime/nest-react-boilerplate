/// <reference types="vitest" />
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
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
      "@app/common/validation": new URL(
        "../../../../libs/common/validation/src/index.ts",
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
      "@app/common-component-test": new URL(
        "../../../../libs/common/component-test/src/index.ts",
        import.meta.url,
      ).pathname,
    },
  },
  cacheDir: "../../../../dist/out-tsc/libs/feature/auth/main-component",
  test: {
    environment: "node",
    include: ["src/**/*.postgres.component-spec.ts"],
    globals: false,
    hookTimeout: 180_000,
    testTimeout: 180_000,
    coverage: {
      enabled: false,
      provider: "v8",
      reportsDirectory: "../../../../coverage/libs/feature/auth/main-component",
      reporter: ["text", "lcov"],
      include: ["src/lib/**/*.{ts,tsx}"],
      exclude: ["src/**/*.spec.ts", "src/**/*.component-spec.ts"],
    },
  },
});
