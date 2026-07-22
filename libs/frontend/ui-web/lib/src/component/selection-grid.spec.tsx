import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UiSelectionGrid } from './selection-grid';

describe('UiSelectionGrid', () => {
  afterEach(cleanup);

  it('emits selected values in catalog order', () => {
    const onValuesChange = vi.fn();
    render(
      <UiSelectionGrid
        label="Roles"
        onValuesChange={onValuesChange}
        options={[
          { label: 'User', value: 'user' },
          { label: 'Operations', value: 'operations' },
          { label: 'Administrator', value: 'admin' },
        ]}
        values={['admin']}
      />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Operations' }));

    expect(onValuesChange).toHaveBeenCalledWith(['operations', 'admin']);
  });

  it('exposes a real fieldset label and respects disabled options', () => {
    render(
      <UiSelectionGrid
        label="Permissions"
        onValuesChange={() => undefined}
        options={[
          {
            description: 'Cannot be assigned directly.',
            disabled: true,
            label: 'Manage all',
            value: 'admin:manage:all',
          },
        ]}
        values={[]}
      />,
    );

    expect(screen.getByRole('group', { name: 'Permissions' })).toBeTruthy();
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Manage all' }).disabled).toBe(true);
    expect(screen.getByText('Cannot be assigned directly.')).toBeTruthy();
  });
});
