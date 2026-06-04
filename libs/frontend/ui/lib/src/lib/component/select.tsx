/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import * as SelectPrimitive from "@radix-ui/react-select";
import { useId, type ReactNode } from "react";
import { UiLabel } from "./label";
import { cn } from "../utils/cn";

export interface UiSelectOption {
  label: ReactNode;
  value: string;
}

export interface UiSelectProps {
  "aria-label"?: string;
  className?: string;
  disabled?: boolean;
  label: string;
  onValueChange: (value: string) => void;
  options: readonly UiSelectOption[];
  placeholder?: string;
  triggerClassName?: string;
  value: string;
}

export const UiSelect = ({
  "aria-label": ariaLabel,
  className,
  disabled,
  label,
  onValueChange,
  options,
  placeholder,
  triggerClassName,
  value,
}: Readonly<UiSelectProps>) => {
  const labelId = useId();
  const selectedOption = options.find((option) => option.value === value);

  return (
    <div
      className={cn(
        "xr-select-field relative inline-flex min-w-0 items-center gap-2 text-sm text-[var(--xr-color-muted)]",
        className,
      )}
    >
      <UiLabel
        className="whitespace-nowrap text-[var(--xr-color-muted)]"
        id={labelId}
      >
        {label}
      </UiLabel>
      <select
        aria-label={ariaLabel ?? label}
        className="xr-select-native absolute right-0 top-0 z-10 h-10 min-w-[8.5rem] cursor-pointer rounded-full opacity-0"
        disabled={disabled}
        onChange={(event) => onValueChange(event.currentTarget.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <SelectPrimitive.Root
        disabled={disabled}
        onValueChange={onValueChange}
        value={value}
      >
        <SelectPrimitive.Trigger
          aria-hidden="true"
          tabIndex={-1}
          className={cn(
            "xr-select-trigger inline-flex h-10 min-w-[8.5rem] max-w-full items-center justify-between gap-2 rounded-full border border-[var(--xr-color-border)] bg-[var(--xr-color-surface-strong)] px-3 text-sm font-semibold text-[var(--xr-color-text)] shadow-sm outline-none transition-[background-color,border-color,box-shadow] hover:border-[color-mix(in_srgb,var(--xr-color-primary)_58%,transparent)] focus-visible:ring-4 focus-visible:ring-[color-mix(in_srgb,var(--xr-color-primary)_28%,transparent)] disabled:cursor-not-allowed disabled:opacity-60",
            triggerClassName,
          )}
        >
          <span className="xr-select-value truncate">
            {selectedOption?.label ?? placeholder}
          </span>
          <SelectPrimitive.Icon
            aria-hidden="true"
            className="text-[var(--xr-color-muted)]"
          >
            ▾
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            className="xr-select-content z-50 max-h-72 min-w-[8.5rem] overflow-hidden rounded-[var(--xr-radius-md)] border border-[var(--xr-color-border)] bg-[var(--xr-color-surface-strong)] p-1 text-[var(--xr-color-text)] shadow-[var(--xr-shadow-lg)]"
            position="popper"
            sideOffset={6}
          >
            <SelectPrimitive.Viewport>
              {options.map((option) => (
                <SelectPrimitive.Item
                  className="xr-select-item relative flex cursor-default select-none items-center rounded-xl px-3 py-2 text-sm outline-none data-[highlighted]:bg-[var(--xr-control-background)] data-[state=checked]:text-[var(--xr-color-primary)]"
                  key={option.value}
                  value={option.value}
                >
                  <SelectPrimitive.ItemText>
                    {option.label}
                  </SelectPrimitive.ItemText>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </div>
  );
};
