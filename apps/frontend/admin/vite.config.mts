/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import istanbul from 'vite-plugin-istanbul';
import {
  applyDefaultFrontendBuildApiBaseUrlMode,
  assertRequiredFrontendBuildApiBaseUrls,
} from '../../../libs/frontend/api-support/lib/src/frontend-env';
import { workspaceTsconfigAliases } from '../../../config/vite/workspace-tsconfig-aliases.mjs';

export default defineConfig(({ command, mode }) => {
  const isE2eCoverage = process.env.VITE_E2E_COVERAGE === 'true';
  applyDefaultFrontendBuildApiBaseUrlMode(process.env, command, mode);
  assertRequiredFrontendBuildApiBaseUrls(process.env, command, mode);

  return {
    root: import.meta.dirname,
    cacheDir: '../../../node_modules/.vite/apps/frontend/admin',
    resolve: {
      tsconfigPaths: true,
      alias: workspaceTsconfigAliases(),
    },
    server: {
      port: 4200,
      host: 'localhost',
    },
    preview: {
      port: 4200,
      host: 'localhost',
    },
    plugins: [
      tailwindcss(),
      react(),
      ...(isE2eCoverage
        ? [
            istanbul({
              cwd: import.meta.dirname,
              include: 'src/**/*.{ts,tsx}',
              exclude: ['src/**/*.spec.*', 'src/**/*.test.*'],
              extension: ['.ts', '.tsx'],
              requireEnv: false,
              forceBuildInstrument: true,
              // Vite 8/Rolldown validates pure annotations after Istanbul wraps JSX
              // branch counters. Dropping generated comments keeps the browser
              // coverage build instrumented without emitting invalid annotations.
              generatorOpts: {
                comments: false,
              },
            }),
          ]
        : []),
    ],
    build: {
      outDir: '../../../dist/apps/frontend/admin',
      emptyOutDir: true,
      reportCompressedSize: true,
      sourcemap: isE2eCoverage,
      commonjsOptions: {
        transformMixedEsModules: true,
      },
    },
  };
});
