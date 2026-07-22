import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { UiButton } from './button';
import { UiCheckbox, UiSwitch } from './choice-controls';
import { UiForm } from './form';
import { UiTextField, UiTextareaField } from './form-field';
import { UiInput } from './input';
import { UiLabel } from './label';
import { UiSelect } from './select';
import { UiSelectionGrid } from './selection-grid';
import { UiTextarea } from './textarea';

const frameStyle = { display: 'grid', gap: 18, width: 'min(760px, 92vw)' } as const;

const FormControlsShowcase = () => {
  const [environment, setEnvironment] = useState('production');
  const [roles, setRoles] = useState(['viewer']);

  return (
    <section aria-label="Form controls" style={frameStyle}>
      <UiForm
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <UiTextField label="Display name" name="displayName" placeholder="Ada Operator" />
        <div>
          <UiLabel htmlFor="service-key">Service key</UiLabel>
          <UiInput id="service-key" name="serviceKey" placeholder="notifications.primary" />
        </div>
        <UiSelect
          label="Environment"
          onValueChange={setEnvironment}
          options={[
            { label: 'Production', value: 'production' },
            { label: 'Staging', value: 'staging' },
          ]}
          value={environment}
        />
        <UiTextareaField label="Audit reason" placeholder="Describe why this change is required" />
        <UiCheckbox label="Require independent approval" />
        <UiSwitch label="Enable delivery" />
        <UiSelectionGrid
          label="Roles"
          onValuesChange={setRoles}
          options={[
            { description: 'Read-only access', label: 'Viewer', value: 'viewer' },
            { description: 'Manage operational workflows', label: 'Operations', value: 'operations' },
            { description: 'Full platform administration', label: 'Administrator', value: 'admin' },
          ]}
          values={roles}
        />
        <UiButton type="submit">Save configuration</UiButton>
      </UiForm>
    </section>
  );
};

const meta = {
  title: 'Foundations/Form controls',
  component: FormControlsShowcase,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof FormControlsShowcase>;

export default meta;

type Story = StoryObj<typeof meta>;

export const CompleteForm: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('textbox', { name: 'Display name' }), 'Grace');
    await userEvent.click(canvas.getByRole('checkbox', { name: 'Operations' }));
    await expect(canvas.getByRole('checkbox', { name: 'Operations' })).toBeChecked();
  },
};

export const ValidationAndDisabled: Story = {
  render: () => (
    <section aria-label="Validation and disabled controls" style={frameStyle}>
      <UiTextField error="A display name is required" label="Display name" />
      <UiTextareaField error="An audit reason is required" label="Audit reason" />
      <UiInput aria-label="Disabled input" disabled readOnly value="Read only" />
      <UiTextarea aria-label="Invalid notes" aria-invalid="true" readOnly value="Invalid value" />
      <div>
        <span>Compact permission matrix control</span>
        <UiCheckbox checked label="Permission assigned to Operations" labelHidden />
      </div>
      <UiSelectionGrid
        disabled
        label="Unavailable roles"
        onValuesChange={() => undefined}
        options={[{ label: 'Administrator', value: 'admin' }]}
        values={['admin']}
      />
    </section>
  ),
};
