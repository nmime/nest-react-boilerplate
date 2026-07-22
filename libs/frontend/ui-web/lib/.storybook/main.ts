import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import type { StorybookConfig } from '@storybook/react-vite';
import { mergeConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

const config: StorybookConfig = {
  framework: { name: '@storybook/react-vite', options: {} },
  stories: [
    '../src/**/*.stories.{ts,tsx,mdx}',
    '../../../../../apps/frontend/admin/storybook/**/*.stories.{ts,tsx}',
    '../../../../../apps/frontend/app/storybook/**/*.stories.{ts,tsx}',
    '../../../../../apps/frontend/landing/storybook/**/*.stories.{ts,tsx}',
    '../../../../../apps/frontend/site/storybook/**/*.stories.{ts,tsx}',
  ],
  addons: ['@storybook/addon-vitest'],
  viteFinal: (viteConfig) =>
    mergeConfig(viteConfig, {
      plugins: [
        tsconfigPaths({
          projects: [resolve(import.meta.dirname, '../../../../../tsconfig.base.json')],
        }),
        tailwindcss(),
      ],
    }),
};

export default config;
