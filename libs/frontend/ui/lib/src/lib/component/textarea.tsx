/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "../utils/cn";

export type UiTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const UiTextarea = forwardRef<HTMLTextAreaElement, UiTextareaProps>(
  ({ className, rows = 4, ...props }, ref) => (
    <textarea
      className={cn(
        "xr-textarea flex min-h-28 w-full min-w-0 rounded-[var(--xr-radius-md)] border border-[var(--xr-color-border)] bg-[var(--xr-input-background)] px-3 py-2 text-sm text-[var(--xr-color-text)] shadow-sm outline-none transition-[background-color,border-color,box-shadow] placeholder:text-[color-mix(in_srgb,var(--xr-color-muted)_72%,transparent)] focus-visible:border-[color-mix(in_srgb,var(--xr-color-primary)_72%,transparent)] focus-visible:ring-4 focus-visible:ring-[color-mix(in_srgb,var(--xr-color-primary)_28%,transparent)] disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-[color-mix(in_srgb,var(--xr-color-warning)_76%,transparent)]",
        className,
      )}
      ref={ref}
      rows={rows}
      {...props}
    />
  ),
);

UiTextarea.displayName = "UiTextarea";
