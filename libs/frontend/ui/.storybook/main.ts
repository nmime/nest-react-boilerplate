import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  stories: ["../lib/src/**/*.stories.@(ts|tsx|mdx)"],
  addons: [],
};

export default config;
