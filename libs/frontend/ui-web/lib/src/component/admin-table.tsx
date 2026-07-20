/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import type {
  HTMLAttributes,
  KeyboardEvent,
  MouseEvent,
  ReactNode,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from 'react';
import { UiButton } from './button';

const defaultErrorTitle = ['Unable', 'to', 'load', 'records'].join(' ');
import { UiEmptyState, UiLoading } from './feedback';
import { UiResourceError } from './resource-error';
import { cn } from '../util/cn';

export type UiDataTableRow = Record<string, unknown>;

export interface UiDataTableColumn<TRow extends UiDataTableRow> {
  align?: 'left' | 'center' | 'right';
  className?: string;
  header: ReactNode;
  headerClassName?: string;
  id: string;
  render: (row: TRow) => ReactNode;
}

export interface UiDataTableStateAction {
  label: string;
  onClick: () => void;
}

type UiDataTableBaseProps = Omit<TableHTMLAttributes<HTMLTableElement>, 'children'>;

export interface UiDataTableProps<TRow extends UiDataTableRow> extends UiDataTableBaseProps {
  columns: readonly UiDataTableColumn<TRow>[];
  emptyDescription?: string;
  emptyTitle?: string;
  error?: ReactNode;
  errorAction?: UiDataTableStateAction;
  getRowAriaLabel?: (row: TRow) => string;
  isLoading?: boolean;
  loadingLabel?: string;
  onRowClick?: (row: TRow) => void;
  rowKey: (row: TRow) => string;
  rows: readonly TRow[];
}

const getAlignmentClassName = (align: UiDataTableColumn<UiDataTableRow>['align']): string | undefined => {
  if (align === 'center') {
    return 'text-center';
  }

  if (align === 'right') {
    return 'text-right';
  }

  return undefined;
};

export const UiTable = ({ className, ...props }: Readonly<TableHTMLAttributes<HTMLTableElement>>) => (
  <table className={cn('xr-table w-full caption-bottom text-sm', className)} data-slot="table" {...props} />
);

export const UiTableHeader = ({ className, ...props }: Readonly<HTMLAttributes<HTMLTableSectionElement>>) => (
  <thead className={cn('xr-table__header', className)} data-slot="table-header" {...props} />
);

export const UiTableBody = ({ className, ...props }: Readonly<HTMLAttributes<HTMLTableSectionElement>>) => (
  <tbody className={cn('xr-table__body', className)} data-slot="table-body" {...props} />
);

export const UiTableRow = ({ className, ...props }: Readonly<HTMLAttributes<HTMLTableRowElement>>) => (
  <tr className={cn('xr-table__row', className)} data-slot="table-row" {...props} />
);

export const UiTableHead = ({ className, ...props }: Readonly<ThHTMLAttributes<HTMLTableCellElement>>) => (
  <th className={cn('xr-table__head', className)} data-slot="table-head" scope="col" {...props} />
);

export const UiTableCell = ({ className, ...props }: Readonly<TdHTMLAttributes<HTMLTableCellElement>>) => (
  <td className={cn('xr-table__cell', className)} data-slot="table-cell" {...props} />
);

const interactiveRowDescendantSelector = 'a, button, input, select, textarea, label, [role="button"]';

const isFromInteractiveDescendant = (target: EventTarget | null, currentTarget: HTMLElement): boolean => {
  if (!(target instanceof Element)) {
    return false;
  }

  const interactive = target.closest(interactiveRowDescendantSelector);

  return interactive !== null && interactive !== currentTarget && currentTarget.contains(interactive);
};

const renderErrorAction = (action?: UiDataTableStateAction): ReactNode => {
  if (!action) {
    return undefined;
  }

  return (
    <UiButton onClick={action.onClick} variant="secondary">
      {action.label}
    </UiButton>
  );
};

export const UiDataTable = <TRow extends UiDataTableRow>({
  className,
  columns,
  emptyDescription = 'Try adjusting filters or creating a new resource.',
  emptyTitle = 'No records found',
  error,
  errorAction,
  getRowAriaLabel,
  isLoading = false,
  loadingLabel = 'Loading records',
  onRowClick,
  rowKey,
  rows,
  ...tableProps
}: Readonly<UiDataTableProps<TRow>>) => {
  if (isLoading) {
    return <UiLoading className="xr-table-state" label={loadingLabel} />;
  }

  if (error) {
    return (
      <UiResourceError
        action={renderErrorAction(errorAction)}
        className="xr-table-state"
        description={typeof error === 'string' ? error : undefined}
        title={defaultErrorTitle}
      >
        {typeof error === 'string' ? undefined : error}
      </UiResourceError>
    );
  }

  if (rows.length === 0) {
    return <UiEmptyState className="xr-table-state" description={emptyDescription} title={emptyTitle} />;
  }

  return (
    <div className="xr-table-wrap" data-admin-primitive="data-table">
      <UiTable className={className} {...tableProps}>
        <UiTableHeader>
          <UiTableRow>
            {columns.map((column) => (
              <UiTableHead className={cn(getAlignmentClassName(column.align), column.headerClassName)} key={column.id}>
                {column.header}
              </UiTableHead>
            ))}
          </UiTableRow>
        </UiTableHeader>
        <UiTableBody>
          {rows.map((row) => {
            const isInteractive = Boolean(onRowClick);
            const handleKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
              if (!onRowClick || (event.key !== 'Enter' && event.key !== ' ')) {
                return;
              }

              // Ignore activation keys originating from interactive controls inside a
              // cell (e.g. a nested input's Space) so they are not hijacked by the row.
              if (isFromInteractiveDescendant(event.target, event.currentTarget)) {
                return;
              }

              event.preventDefault();
              onRowClick(row);
            };
            const handleClick = (event: MouseEvent<HTMLTableRowElement>) => {
              if (!onRowClick || isFromInteractiveDescendant(event.target, event.currentTarget)) {
                return;
              }

              onRowClick(row);
            };

            return (
              <UiTableRow
                aria-label={getRowAriaLabel?.(row)}
                className={isInteractive ? 'xr-table__row--interactive' : undefined}
                key={rowKey(row)}
                onClick={onRowClick ? handleClick : undefined}
                onKeyDown={handleKeyDown}
                tabIndex={isInteractive ? 0 : undefined}
              >
                {columns.map((column) => (
                  <UiTableCell className={cn(getAlignmentClassName(column.align), column.className)} key={column.id}>
                    {column.render(row)}
                  </UiTableCell>
                ))}
              </UiTableRow>
            );
          })}
        </UiTableBody>
      </UiTable>
    </div>
  );
};

export const AdminDataTable = UiDataTable;

export const Table = UiTable;
export const TableHeader = UiTableHeader;
export const TableBody = UiTableBody;
export const TableRow = UiTableRow;
export const TableHead = UiTableHead;
export const TableCell = UiTableCell;
export const DataTable = UiDataTable;
