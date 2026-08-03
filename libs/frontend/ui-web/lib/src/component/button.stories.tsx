import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import { UiButton } from './button';

const primaryLabel = ['Create', 'workspace'].join(' ');
const secondaryLabel = ['Read', 'docs'].join(' ');
const loadingLabel = ['Saving'].join('');

const meta = {
  title: 'Components/UiButton',
  component: UiButton,
  tags: ['visual'],
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof UiButton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    children: primaryLabel,
    variant: 'primary',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button', { name: primaryLabel });

    await userEvent.click(button);
    button.focus();

    await expect(button).toHaveFocus();
    document.documentElement.setAttribute('data-visual-ready', 'true');
  },
};

export const SecondaryLink: Story = {
  args: {
    children: secondaryLabel,
    href: '/docs',
    variant: 'secondary',
  },
};

export const ExternalLink: Story = {
  args: {
    children: secondaryLabel,
    href: 'https://example.com/docs',
    target: '_blank',
    variant: 'secondary',
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
    href: '/docs',
    variant: 'secondary',
  },
};

export const VariantAndSizeScale: Story = {
  // This story renders its own scale grid instead of a single argument-driven
  // button, but `Story` still requires `args` because `children` is required on
  // UiButton. Declare them so the story stays type-checked.
  args: { children: 'Default action' },
  render: () => (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
        <UiButton size="sm">Small action</UiButton>
        <UiButton>Default action</UiButton>
        <UiButton size="lg">Large action</UiButton>
      </div>
      <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
        <UiButton>Save changes</UiButton>
        <UiButton variant="secondary">Cancel</UiButton>
        <UiButton variant="outline">Review</UiButton>
        <UiButton variant="ghost">More</UiButton>
        <UiButton variant="destructive">Delete</UiButton>
      </div>
    </div>
  ),
};
