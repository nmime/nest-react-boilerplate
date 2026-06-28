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
        "xr-card min-w-0 flex-1 basis-60 rounded-[var(--xr-radius-lg)] border border-border bg-card p-5 text-card-foreground shadow-sm transition-[border-color,box-shadow,transform] focus-within:ring-4 focus-within:ring-ring/20",
        className,
      )}
    >
      {title ? (
        <h3
          className="xr-card__title m-0 text-base font-semibold text-foreground"
          id={headingId}
        >
          {title}
        </h3>
      ) : null}
      <div className="xr-card__body text-muted-foreground leading-7">
        {children}
      </div>
    </article>
  );
};
