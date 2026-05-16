/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { fullCoverage } from "../../../tools/vitest-coverage.mts";

export default defineConfig({
  cacheDir: "../../../node_modules/.vitest/apps/backend/user-app-api",
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
      "@app/feature-user-main": new URL(
        "../../../libs/feature/user/main/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/feature-user-shared": new URL(
        "../../../libs/feature/user/shared/src/index.ts",
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
