import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import istanbul from 'vite-plugin-istanbul';

export default defineConfig(() => {
  const isE2eCoverage = process.env.VITE_E2E_COVERAGE === 'true';

  return {
    cacheDir: '../../../node_modules/.cache/vite',
    root: import.meta.dirname,
    resolve: { tsconfigPaths: true },
    server: { host: 'localhost', port: 4204 },
    preview: { host: 'localhost', port: 4204 },
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
              generatorOpts: { comments: false },
            }),
          ]
        : []),
    ],
    build: {
      outDir: '../../../dist/apps/frontend/starter-app',
      emptyOutDir: true,
      reportCompressedSize: false,
      sourcemap: isE2eCoverage,
    },
  };
});
