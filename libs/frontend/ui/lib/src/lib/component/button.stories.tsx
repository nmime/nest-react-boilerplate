import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";

import { UiButton } from "./button";

const primaryLabel = ["Create", "workspace"].join(" ");
const secondaryLabel = ["Read", "docs"].join(" ");
const loadingLabel = ["Saving"].join("");

const meta = {
  title: "Components/UiButton",
  component: UiButton,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof UiButton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    children: primaryLabel,
    variant: "primary",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button", { name: primaryLabel });

    await userEvent.click(button);
    button.focus();

    await expect(button).toHaveFocus();
  },
};

export const SecondaryLink: Story = {
  args: {
    children: secondaryLabel,
    href: "/docs",
    variant: "secondary",
  },
};

export const ExternalLink: Story = {
  args: {
    children: secondaryLabel,
    href: "https://example.com/docs",
    target: "_blank",
    variant: "secondary",
  },
};

export const Loading: Story = {
  args: {
    children: primaryLabel,
    isLoading: true,
    loadingLabel,
  },
};

export const DisabledLink: Story = {
  args: {
    children: secondaryLabel,
    disabled: true,
    href: "/docs",
    variant: "secondary",
  },
};
