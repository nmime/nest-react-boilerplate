/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { fullCoverage } from "../../../../tools/vitest-coverage.mts";

export default defineConfig({
  cacheDir: "node_modules/.vitest/out-tsc/libs/features/auth/main",
  resolve: {
    alias: {
      "@app/common/shared": new URL(
        "../../../../libs/common/shared/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/common/response": new URL(
        "../../../../libs/common/response/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/features-auth-oauth": new URL(
        "../../../../libs/features/auth/oauth/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/features-auth-shared": new URL(
        "../../../../libs/features/auth/shared/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/features-admin-shared": new URL(
        "../../../../libs/features/admin/shared/src/index.ts",
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
      "../../../../coverage/libs/features/auth/main",
      ["src/**/*.ts"],
      ["src/index.ts"],
    ),
  },
});
