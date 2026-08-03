import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { radixModalLayerA11y } from '../../.storybook/a11y-exceptions';
import { UiButton } from './button';
import { UiDialog } from './dialog';
import { UiDropdownMenu } from './dropdown-menu';
import { UiSelect } from './select';

const PortalInteractionHarness = () => {
  const [status, setStatus] = useState('active');
  const [lastAction, setLastAction] = useState('No action');

  return (
    <div className="grid max-w-xl gap-5">
      <UiDialog
        description="Verify focus management in a real browser."
        title="Edit workspace"
        trigger={<UiButton>Open dialog</UiButton>}
      >
        <p>Dialog body</p>
      </UiDialog>
      <UiSelect
        aria-label="Status"
        label="Status"
        onValueChange={setStatus}
        options={[
          { label: 'Active', value: 'active' },
          { label: 'Suspended', value: 'suspended' },
        ]}
        value={status}
      />
      <p aria-live="polite">Selected status: {status}</p>
      <UiDropdownMenu
        items={[
          {
            label: 'Archive',
            onSelect: () => {
              setLastAction('Archive');
            },
          },
          {
            label: 'Suspend',
            onSelect: () => {
              setLastAction('Suspend');
            },
          },
        ]}
        trigger={<UiButton variant="secondary">Actions</UiButton>}
      />
      <p aria-live="polite">Last action: {lastAction}</p>
    </div>
  );
};

const meta = {
  title: 'Components/Portal interactions',
  component: PortalInteractionHarness,
  tags: ['visual'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof PortalInteractionHarness>;

export default meta;

type Story = StoryObj<typeof meta>;

export const DialogSelectAndMenu: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const portal = within(document.body);

    const dialogTrigger = canvas.getByRole('button', { name: 'Open dialog' });
    await userEvent.click(dialogTrigger);
    await expect(portal.getByRole('dialog', { name: 'Edit workspace' })).toBeVisible();
    await expect(portal.getByRole('button', { name: 'Close' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await expect(portal.queryByRole('dialog', { name: 'Edit workspace' })).not.toBeInTheDocument();
    await expect(dialogTrigger).toHaveFocus();

    await userEvent.click(canvas.getByRole('combobox', { name: 'Status' }));
    await expect(portal.getByRole('listbox')).toBeVisible();
    await userEvent.click(portal.getByRole('option', { name: 'Suspended' }));
    await expect(canvas.getByText('Selected status: suspended')).toBeVisible();
    await expect(portal.queryByRole('listbox')).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole('button', { name: 'Actions' }));
    await expect(portal.getByRole('menu', { name: 'Actions' })).toBeVisible();
    await userEvent.click(portal.getByRole('menuitem', { name: 'Archive' }));
    await expect(canvas.getByText('Last action: Archive')).toBeVisible();
    await expect(portal.queryByRole('menu', { name: 'Actions' })).not.toBeInTheDocument();
    document.documentElement.setAttribute('data-visual-ready', 'true');
  },
};

export const SelectOpened: Story = {
  parameters: radixModalLayerA11y,
  render: () => (
    <UiSelect
      aria-label="Visual status"
      label="Status"
      onValueChange={() => undefined}
      options={[
        { label: 'Active', value: 'active' },
        { label: 'Suspended', value: 'suspended' },
      ]}
      value="active"
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const portal = within(document.body);

    await userEvent.click(canvas.getByRole('combobox', { name: 'Visual status' }));
    await expect(portal.getByRole('listbox')).toBeVisible();
    document.documentElement.setAttribute('data-visual-ready', 'true');
  },
};
