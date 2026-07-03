/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import { forwardRef, type FormHTMLAttributes } from "react";
import { cn } from "../utils/cn";

export type UiFormProps = FormHTMLAttributes<HTMLFormElement>;

export const UiForm = forwardRef<HTMLFormElement, UiFormProps>(
  ({ className, ...props }, ref) => (
    <form
      className={cn("xr-form grid gap-4", className)}
      ref={ref}
      {...props}
    />
  ),
);

UiForm.displayName = "UiForm";
