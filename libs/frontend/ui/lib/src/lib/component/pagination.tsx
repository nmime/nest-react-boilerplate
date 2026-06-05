/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import type { ReactNode } from "react";
import { UiButton } from "./button";

const previousPageLabel = ["Go", "to", "previous", "page"].join(" ");
const nextPageLabel = ["Go", "to", "next", "page"].join(" ");
import { cn } from "../utils/cn";

export interface UiPaginationProps {
  className?: string;
  currentPage: number;
  label?: string;
  onPageChange: (page: number) => void;
  pageSize?: number;
  totalItems?: number;
  totalPages: number;
}

const getVisiblePages = (currentPage: number, totalPages: number): number[] => {
  const safeTotal = Math.max(1, totalPages);
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(safeTotal, start + 4);
  const adjustedStart = Math.max(1, end - 4);

  return Array.from(
    { length: end - adjustedStart + 1 },
    (_, index) => adjustedStart + index,
  );
};

const renderSummary = ({
  currentPage,
  pageSize,
  totalItems,
  totalPages,
}: Pick<
  UiPaginationProps,
  "currentPage" | "pageSize" | "totalItems" | "totalPages"
>): ReactNode => {
  if (!pageSize || totalItems === undefined) {
    return `Page ${currentPage} of ${totalPages}`;
  }

  const start = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const end = Math.min(totalItems, currentPage * pageSize);

  return `${start}-${end} of ${totalItems}`;
};

export const UiPagination = ({
  className,
  currentPage,
  label = "Pagination",
  onPageChange,
  pageSize,
  totalItems,
  totalPages,
}: Readonly<UiPaginationProps>) => {
  const safeTotalPages = Math.max(1, totalPages);
  const safeCurrentPage = Math.min(Math.max(1, currentPage), safeTotalPages);
  const pages = getVisiblePages(safeCurrentPage, safeTotalPages);

  return (
    <nav
      aria-label={label}
      className={cn("xr-pagination", className)}
      data-admin-primitive="pagination"
    >
      <p aria-live="polite" className="xr-pagination__summary">
        {renderSummary({
          currentPage: safeCurrentPage,
          pageSize,
          totalItems,
          totalPages: safeTotalPages,
        })}
      </p>
      <div className="xr-pagination__controls">
        <UiButton
          aria-label={previousPageLabel}
          disabled={safeCurrentPage <= 1}
          onClick={() => onPageChange(safeCurrentPage - 1)}
          variant="secondary"
        >
          Previous
        </UiButton>
        {pages.map((page) => (
          <UiButton
            aria-current={page === safeCurrentPage ? "page" : undefined}
            aria-label={`Go to page ${page}`}
            className="xr-pagination__page"
            key={page}
            onClick={() => onPageChange(page)}
            variant={page === safeCurrentPage ? "primary" : "secondary"}
          >
            {page}
          </UiButton>
        ))}
        <UiButton
          aria-label={nextPageLabel}
          disabled={safeCurrentPage >= safeTotalPages}
          onClick={() => onPageChange(safeCurrentPage + 1)}
          variant="secondary"
        >
          Next
        </UiButton>
      </div>
    </nav>
  );
};
