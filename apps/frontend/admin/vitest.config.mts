/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { fullCoverage } from "../../../config/vitest-coverage.mts";
import react from "@vitejs/plugin-react";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: "../../../node_modules/.vitest/apps/frontend/admin",
  plugins: [react(), nxViteTsPaths()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.spec.ts", "src/**/*.spec.tsx"],
    passWithNoTests: false,
    coverage: fullCoverage(
      "../../../coverage/apps/frontend/admin",
      ["src/app/**/*.{ts,tsx}"],
      [],
    ),
  },
});
