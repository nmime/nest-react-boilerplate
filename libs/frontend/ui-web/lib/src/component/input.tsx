/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "../util/cn";

export type UiInputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, UiInputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      className={cn(
        "xr-input flex h-10 w-full min-w-0 rounded-[var(--xr-radius-md)] border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-[background-color,border-color,box-shadow] placeholder:text-muted-foreground focus-visible:ring-4 focus-visible:ring-ring/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        className,
      )}
      data-slot="input"
      ref={ref}
      type={type}
      {...props}
    />
  ),
);

Input.displayName = "Input";

export const UiInput = Input;
