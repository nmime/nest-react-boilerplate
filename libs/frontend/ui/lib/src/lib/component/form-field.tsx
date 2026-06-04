/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { UiInput } from "./input";
import { UiLabel } from "./label";
import { cn } from "../utils/cn";

export interface UiTextFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "children"
> {
  error?: string;
  hint?: ReactNode;
  inputClassName?: string;
  label: string;
}

export const UiTextField = ({
  className,
  error,
  hint,
  id,
  inputClassName,
  label,
  ...inputProps
}: Readonly<UiTextFieldProps>) => {
  const generatedId = useId();
  const generatedHintId = useId();
  const generatedErrorId = useId();
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-${generatedHintId}-hint` : undefined;
  const errorId = error ? `${inputId}-${generatedErrorId}-error` : undefined;
  const describedBy = [inputProps["aria-describedby"], hintId, errorId]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cn("xr-field grid min-w-0 gap-2", className)}>
      <UiLabel htmlFor={inputId}>{label}</UiLabel>
      <UiInput
        {...inputProps}
        aria-describedby={describedBy || undefined}
        aria-invalid={error ? true : inputProps["aria-invalid"]}
        className={inputClassName}
        id={inputId}
      />
      {hint ? (
        <p
          className="xr-field__hint m-0 text-sm text-[var(--xr-color-muted)]"
          id={hintId}
        >
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          className="xr-field__error m-0 text-sm text-[var(--xr-color-warning)]"
          id={errorId}
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
};
