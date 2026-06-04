/// <reference types='vitest' />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import { nxCopyAssetsPlugin } from "@nx/vite/plugins/nx-copy-assets.plugin";
import istanbul from "vite-plugin-istanbul";
import { assertRequiredFrontendApiBaseUrls } from "../../../libs/frontend/ui/lib/src/lib/config/frontend-env";

export default defineConfig(({ command, mode }) => {
  const isE2eCoverage = process.env.VITE_E2E_COVERAGE === "true";
  assertRequiredFrontendApiBaseUrls({
    ...process.env,
    DEV: command !== "build" || mode !== "production",
    MODE: mode,
    PROD: command === "build" && mode === "production",
  });

  return {
    root: import.meta.dirname,
    cacheDir: "../../../node_modules/.vite/apps/frontend/app",
    server: {
      port: 4201,
      host: "localhost",
    },
    preview: {
      port: 4201,
      host: "localhost",
    },
    plugins: [
      tailwindcss(),
      react(),
      nxViteTsPaths(),
      nxCopyAssetsPlugin(["*.md"]),
      ...(isE2eCoverage
        ? [
            istanbul({
              cwd: import.meta.dirname,
              include: "src/**/*.{ts,tsx}",
              exclude: ["src/**/*.spec.*", "src/**/*.test.*"],
              extension: [".ts", ".tsx"],
              requireEnv: false,
              forceBuildInstrument: true,
            }),
          ]
        : []),
    ],
    build: {
      outDir: "../../../dist/apps/frontend/app",
      emptyOutDir: true,
      reportCompressedSize: true,
      sourcemap: isE2eCoverage,
      commonjsOptions: {
        transformMixedEsModules: true,
      },
    },
  };
});
