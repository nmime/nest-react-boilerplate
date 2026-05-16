/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { fullCoverage } from "../../../tools/vitest-coverage.mts";

export default defineConfig({
  cacheDir: "../../../node_modules/.vitest/apps/backend/user-app-api",
  resolve: {
    alias: {
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
      "@app/features-auth-oauth": new URL(
        "../../../libs/features/auth/oauth/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/features-user-main": new URL(
        "../../../libs/features/user/main/src/index.ts",
        import.meta.url,
      ).pathname,
      "@app/features-user-shared": new URL(
        "../../../libs/features/user/shared/src/index.ts",
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
