/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { workspaceTsconfigAliases } from "../../../../config/vite/workspace-tsconfig-aliases.mjs";

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: "../../../../node_modules/.vitest/libs/frontend/ui-native",
  resolve: {
    tsconfigPaths: true,
    alias: workspaceTsconfigAliases(),
  },
  test: {
    environment: "happy-dom",
    include: ["src/**/*.spec.ts", "src/**/*.spec.tsx"],
    passWithNoTests: false,
  },
});
