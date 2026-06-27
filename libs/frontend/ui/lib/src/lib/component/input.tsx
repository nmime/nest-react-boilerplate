/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "../utils/cn";

export type UiInputProps = InputHTMLAttributes<HTMLInputElement>;

export const UiInput = forwardRef<HTMLInputElement, UiInputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      className={cn(
        "xr-input flex h-11 w-full min-w-0 rounded-[var(--xr-radius-md)] border border-input border-[var(--xr-color-border)] bg-background bg-[var(--xr-input-background)] px-3 py-2 text-sm text-foreground text-[var(--xr-color-text)] shadow-sm outline-none transition-[background-color,border-color,box-shadow] placeholder:text-muted-foreground placeholder:text-[color-mix(in_srgb,var(--xr-color-muted)_72%,transparent)] focus-visible:border-[color-mix(in_srgb,var(--xr-color-primary)_72%,transparent)] focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:ring-[color-mix(in_srgb,var(--xr-color-primary)_28%,transparent)] disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive aria-invalid:border-[color-mix(in_srgb,var(--xr-color-warning)_76%,transparent)]",
        className,
      )}
      ref={ref}
      type={type}
      {...props}
    />
  ),
);

UiInput.displayName = "UiInput";
