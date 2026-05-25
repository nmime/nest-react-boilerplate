/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { fullCoverage } from "../../../tools/vitest-coverage.mts";
import react from "@vitejs/plugin-react";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: "../../../node_modules/.vitest/libs/frontend/ui",
  plugins: [react(), nxViteTsPaths()],
  test: {
    environment: "jsdom",
    include: ["lib/lib/src/**/*.spec.ts", "lib/lib/src/**/*.spec.tsx"],
    passWithNoTests: false,
    coverage: fullCoverage(
      "../../../coverage/libs/frontend/ui",
      ["lib/src/lib/**/*.{ts,tsx}"],
      [],
    ),
  },
});
