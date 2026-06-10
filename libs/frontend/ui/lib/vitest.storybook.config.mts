/// <reference types="vitest" />
import path from "node:path";

import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: import.meta.dirname,
  plugins: [nxViteTsPaths()],
  test: {
    projects: [
      {
        extends: true,
        plugins: [
          storybookTest({
            configDir: path.join(import.meta.dirname, ".storybook"),
          }),
        ],
        test: {
          browser: {
            enabled: true,
            headless: true,
            instances: [{ browser: "chromium" }],
            provider: playwright({}),
          },
          name: "storybook",
        },
      },
    ],
  },
});
