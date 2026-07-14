import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UiDataTable } from './admin-table';

interface Row extends Record<string, unknown> {
  id: string;
  name: string;
}

const rows: Row[] = [{ id: 'usr_1', name: 'Ada' }];

describe('UiDataTable branch coverage', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('applies center and right alignment classes to headers and cells', () => {
    render(
      <UiDataTable
        columns={[
          {
            align: 'center',
            header: 'Centered',
            id: 'centered',
            render: (row) => row.name,
          },
          {
            align: 'right',
            header: 'Righted',
            id: 'righted',
            render: (row) => row.id,
          },
        ]}
        rowKey={(row) => row.id}
        rows={rows}
      />,
    );

    expect(screen.getByRole('columnheader', { name: 'Centered' }).className).toContain('text-center');
    expect(screen.getByRole('columnheader', { name: 'Righted' }).className).toContain('text-right');
    expect(screen.getByRole('cell', { name: 'Ada' }).className).toContain('text-center');
    expect(screen.getByRole('cell', { name: 'usr_1' }).className).toContain('text-right');
  });

  it('invokes the row click handler on pointer clicks', () => {
    const onRowClick = vi.fn();

    render(
      <UiDataTable
        columns={[{ header: 'Name', id: 'name', render: (row) => row.name }]}
        getRowAriaLabel={(row) => `Open ${row.name}`}
        onRowClick={onRowClick}
        rowKey={(row) => row.id}
        rows={rows}
      />,
    );

    fireEvent.click(screen.getByLabelText('Open Ada'));
    expect(onRowClick).toHaveBeenCalledWith(rows[0]);
  });

  it('ignores non-activation keys on interactive rows', () => {
    const onRowClick = vi.fn();

    render(
      <UiDataTable
        columns={[{ header: 'Name', id: 'name', render: (row) => row.name }]}
        getRowAriaLabel={(row) => `Open ${row.name}`}
        onRowClick={onRowClick}
        rowKey={(row) => row.id}
        rows={rows}
      />,
    );

    fireEvent.keyDown(screen.getByLabelText('Open Ada'), { key: 'Escape' });
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('renders non-interactive rows without a click handler or tab stop', () => {
    const onRowClick = vi.fn();

    render(
      <UiDataTable
        columns={[{ header: 'Name', id: 'name', render: (row) => row.name }]}
        rowKey={(row) => row.id}
        rows={rows}
      />,
    );

    const row = screen.getByText('Ada').closest('tr');
    expect(row).not.toBeNull();
    expect(row?.getAttribute('tabindex')).toBeNull();
    expect(row?.className ?? '').not.toContain('interactive');

    fireEvent.keyDown(row as HTMLElement, { key: 'Enter' });
    fireEvent.click(row as HTMLElement);
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('renders a React node error without a string description', () => {
    render(
      <UiDataTable<Row>
        columns={[{ header: 'Name', id: 'name', render: (row) => row.name }]}
        error={<span data-testid="node-error">Broken pipeline</span>}
        rowKey={(row) => row.id}
        rows={[]}
      />,
    );

    expect(screen.getByTestId('node-error').textContent).toBe('Broken pipeline');
  });
});
