/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import { useId, type ReactNode } from "react";
import { UiInput } from "./input";
import { UiLabel } from "./label";
import { cn } from "../utils/cn";

export interface UiSearchFilterToolbarProps {
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  label?: string;
  onSearchChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  searchLabel?: string;
  searchPlaceholder?: string;
  searchValue?: string;
}

export const UiSearchFilterToolbar = ({
  actions,
  children,
  className,
  label = "Search and filters",
  onSearchChange,
  onSubmit,
  searchLabel = "Search",
  searchPlaceholder = "Search resources",
  searchValue = "",
}: Readonly<UiSearchFilterToolbarProps>) => {
  const searchId = useId();
  const handleSubmit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    onSubmit?.(searchValue);
  };

  return (
    <form
      aria-label={label}
      className={cn("xr-toolbar", className)}
      data-admin-primitive="search-filter-toolbar"
      onSubmit={handleSubmit}
      role="search"
    >
      <div className="xr-toolbar__search">
        <UiLabel className="sr-only" htmlFor={searchId}>
          {searchLabel}
        </UiLabel>
        <UiInput
          id={searchId}
          onChange={(event) => onSearchChange?.(event.currentTarget.value)}
          placeholder={searchPlaceholder}
          type="search"
          value={searchValue}
        />
      </div>
      {children ? <div className="xr-toolbar__filters">{children}</div> : null}
      {actions ? <div className="xr-toolbar__actions">{actions}</div> : null}
    </form>
  );
};

export const AdminSearchFilterToolbar = UiSearchFilterToolbar;
