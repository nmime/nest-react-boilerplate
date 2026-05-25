import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";

import { UiButton } from "./button";

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
    children: "Create workspace",
    variant: "primary",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button", { name: "Create workspace" });

    await userEvent.click(button);
    button.focus();

    await expect(button).toHaveFocus();
  },
};

export const SecondaryLink: Story = {
  args: {
    children: "Read docs",
    href: "/docs",
    variant: "secondary",
  },
};
