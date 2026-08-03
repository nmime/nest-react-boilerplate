import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import istanbul from 'vite-plugin-istanbul';
import {
  applyDefaultFrontendBuildApiBaseUrlMode,
  assertRequiredFrontendBuildApiBaseUrls,
} from '../../libs/frontend/api-support/lib/src/frontend-env';
import { workspaceTsconfigAliases } from './workspace-tsconfig-aliases.mjs';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Shared Vite config for the Vite-built frontend apps (user `app`, `admin`,
 * `landing`). They differ only in their directory name and dev/preview port, so
 * everything else — tailwind + react plugins, workspace tsconfig aliases, the
 * build-time API base-url guards, and the optional istanbul E2E-coverage
 * instrumentation — lives here to prevent drift.
 *
 * @param {{ appName: string; port: number }} options
 *   `appName` is the directory under `apps/frontend/`; `port` is the dev/preview port.
 */
export function createFrontendViteConfig({ appName, port }) {
  const appRoot = resolve(workspaceRoot, 'apps/frontend', appName);

  return defineConfig(({ command, mode }) => {
    const isE2eCoverage = process.env.VITE_E2E_COVERAGE === 'true';
    applyDefaultFrontendBuildApiBaseUrlMode(process.env, command, mode);
    assertRequiredFrontendBuildApiBaseUrls(process.env, command, mode);

    return {
      root: appRoot,
      cacheDir: resolve(workspaceRoot, 'node_modules/.vite/apps/frontend', appName),
      resolve: {
        tsconfigPaths: true,
        alias: workspaceTsconfigAliases(),
      },
      server: {
        port,
        host: 'localhost',
      },
      preview: {
        port,
        host: 'localhost',
      },
      plugins: [
        tailwindcss(),
        react(),
        ...(isE2eCoverage
          ? [
              istanbul({
                cwd: appRoot,
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
        outDir: resolve(workspaceRoot, 'dist/apps/frontend', appName),
        emptyOutDir: true,
        reportCompressedSize: true,
        sourcemap: isE2eCoverage,
        commonjsOptions: {
          transformMixedEsModules: true,
        },
        rollupOptions: {
          output: {
            // Without this every app shipped one ~1.1 MB entry chunk, so any
            // application change invalidated the whole download and the
            // framework was re-fetched on every deploy. Split the long-lived
            // vendor groups out by resolved module path so they cache
            // independently of app code. Grouped rather than one-chunk-per-
            // package to avoid a long request waterfall on first load.
            manualChunks: (id) => {
              if (!id.includes('node_modules')) {
                return undefined;
              }
              if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/u.test(id)) {
                return 'vendor-react';
              }
              if (id.includes('@tanstack')) {
                return 'vendor-router-query';
              }
              if (id.includes('@radix-ui') || id.includes('lucide-react')) {
                return 'vendor-ui';
              }
              if (id.includes('mobx')) {
                return 'vendor-state';
              }
              return 'vendor';
            },
          },
        },
      },
    };
  });
}
