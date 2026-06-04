/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import { useId, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../utils/cn";

export interface UiCardProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  title?: string;
  titleId?: string;
}

export const UiCard = ({
  children,
  className,
  title,
  titleId,
  ...props
}: Readonly<UiCardProps>) => {
  const generatedTitleId = useId();
  const headingId = title ? (titleId ?? generatedTitleId) : undefined;
  const {
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
    ...articleProps
  } = props;

  return (
    <article
      {...articleProps}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy ?? (ariaLabel ? undefined : headingId)}
      className={cn(
        "xr-card min-w-0 flex-1 basis-60 rounded-[var(--xr-radius-md)] border border-[var(--xr-color-border)] bg-[var(--xr-card-background)] p-5 shadow-sm transition-colors focus-within:border-[color-mix(in_srgb,var(--xr-color-primary)_58%,transparent)]",
        className,
      )}
    >
      {title ? (
        <h3
          className="xr-card__title m-0 text-base font-bold text-[var(--xr-color-text)]"
          id={headingId}
        >
          {title}
        </h3>
      ) : null}
      <div className="xr-card__body text-[var(--xr-color-muted)] leading-7">
        {children}
      </div>
    </article>
  );
};
