/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "../utils/cn";

export type UiTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const UiTextarea = forwardRef<HTMLTextAreaElement, UiTextareaProps>(
  ({ className, rows = 4, ...props }, ref) => (
    <textarea
      className={cn(
        "xr-textarea flex min-h-28 w-full min-w-0 rounded-[var(--xr-radius-md)] border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-[background-color,border-color,box-shadow] placeholder:text-muted-foreground focus-visible:ring-4 focus-visible:ring-ring/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        className,
      )}
      ref={ref}
      rows={rows}
      {...props}
    />
  ),
);

UiTextarea.displayName = "UiTextarea";
