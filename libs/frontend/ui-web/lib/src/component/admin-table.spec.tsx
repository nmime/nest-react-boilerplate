// @requirements REQ-FRONTEND-ACCESSIBILITY-003
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

  it('exposes compact column labels for the responsive record layout', () => {
    render(
      <UiDataTable
        columns={[{ header: 'Name', id: 'name', render: (row) => row.name }]}
        rowKey={(row) => row.id}
        rows={rows}
      />,
    );

    expect(screen.getByRole('cell', { name: 'Ada' }).getAttribute('data-label')).toBe('Name');
    expect(document.querySelector('[data-admin-primitive="data-table"]')?.getAttribute('data-layout')).toBe('stack');
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

  it('does not fire the row click handler when a nested control is activated', () => {
    const onRowClick = vi.fn();
    const onDelete = vi.fn();

    render(
      <UiDataTable
        columns={[
          { header: 'Name', id: 'name', render: (row) => row.name },
          {
            header: 'Actions',
            id: 'actions',
            render: () => (
              <button onClick={onDelete} type="button">
                Delete
              </button>
            ),
          },
        ]}
        onRowClick={onRowClick}
        rowKey={(row) => row.id}
        rows={rows}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('does not swallow space or fire the row handler from a nested input', () => {
    const onRowClick = vi.fn();

    render(
      <UiDataTable
        columns={[{ header: 'Name', id: 'name', render: () => <input aria-label="Edit name" /> }]}
        onRowClick={onRowClick}
        rowKey={(row) => row.id}
        rows={rows}
      />,
    );

    const notPrevented = fireEvent.keyDown(screen.getByLabelText('Edit name'), { key: ' ' });
    expect(notPrevented).toBe(true);
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
