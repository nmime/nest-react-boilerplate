/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import { useId, type InputHTMLAttributes, type ReactNode } from "react";

export interface UiTextFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "children"
> {
  error?: string;
  hint?: ReactNode;
  inputClassName?: string;
  label: string;
}

const classNames = (...values: Array<string | undefined | false>): string =>
  values.filter(Boolean).join(" ");

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
    <div className={classNames("xr-field", className)}>
      <label className="xr-field__label" htmlFor={inputId}>
        {label}
      </label>
      <input
        {...inputProps}
        aria-describedby={describedBy || undefined}
        aria-invalid={error ? true : inputProps["aria-invalid"]}
        className={classNames("xr-input", inputClassName)}
        id={inputId}
      />
      {hint ? (
        <p className="xr-field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="xr-field__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
};
