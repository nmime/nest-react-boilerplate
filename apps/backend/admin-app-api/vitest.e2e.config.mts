/// <reference types="vitest" />
import { defineConfig } from "vitest/config";

export default defineConfig({
  cacheDir: "../../../node_modules/.vitest/apps/backend/admin-app-api-e2e",
  resolve: {
    alias: {
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
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.e2e-spec.ts"],
    globals: false,
    coverage: {
      enabled: true,
      provider: "v8",
      reportsDirectory: "../../../coverage/e2e/apps/backend/admin-app-api",
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
