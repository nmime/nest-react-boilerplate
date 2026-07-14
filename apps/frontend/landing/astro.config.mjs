import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';
import { workspaceTsconfigAliases } from '../../../config/vite/workspace-tsconfig-aliases.mjs';

export default defineConfig({
  root: import.meta.dirname,
  srcDir: './src/astro',
  publicDir: './public',
  outDir: '../../../dist/apps/frontend/landing',
  output: 'static',
  site: process.env.PUBLIC_SITE_URL ?? 'http://localhost:4202',
  server: {
    host: 'localhost',
    port: 4202,
  },
  vite: {
    cacheDir: '../../../node_modules/.vite/apps/frontend/landing-astro',
    resolve: {
      tsconfigPaths: true,
      alias: workspaceTsconfigAliases(),
    },
    plugins: [tailwindcss()],
  },
  integrations: [react(), mdx(), sitemap()],
});
