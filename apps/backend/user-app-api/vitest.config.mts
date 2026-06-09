/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { fullCoverage } from "../../../config/vitest-coverage.mts";

export default defineConfig({
  cacheDir: "../../../node_modules/.vitest/apps/backend/user-app-api",
  resolve: {
    alias: {
      "@app/common/i18n": new URL(
        "../../../libs/common/i18n/lib/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/common/network": new URL(
        "../../../libs/backend/common/network/lib/src/index.ts",
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
      "@app/common/validation": new URL(
        "../../../libs/backend/common/validation/lib/src/index.ts",
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
    include: ["src/**/*.spec.ts", "src/**/*.e2e-spec.ts"],
    globals: false,
    coverage: fullCoverage(
      "../../../coverage/apps/backend/user-app-api",
      ["src/**/*.ts"],
      [],
    ),
  },
});
