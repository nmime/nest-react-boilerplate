/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
// nx-ignore-next-line
import { fullCoverage } from "../../../packages/tooling/src/testing/vitest-coverage.mts";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: "../../../node_modules/.vitest/apps/frontend/app",
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.spec.ts", "src/**/*.spec.tsx"],
    passWithNoTests: false,
    coverage: fullCoverage(
      "../../../coverage/apps/frontend/app",
      ["src/app/**/*.{ts,tsx}"],
      [],
    ),
  },
});
