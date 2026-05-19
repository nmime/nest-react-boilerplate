import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@app/common/i18n": fileURLToPath(
        new URL("../../common/i18n/src/index.ts", import.meta.url),
      ),
      "@app/frontend-ui": fileURLToPath(
        new URL("../ui/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    passWithNoTests: true,
  },
});
