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
        "xr-select-field relative inline-flex min-w-0 items-center gap-2 text-sm text-muted-foreground",
        className,
      )}
    >
      <UiLabel className="whitespace-nowrap text-muted-foreground" id={labelId}>
        {label}
      </UiLabel>
      <SelectPrimitive.Root
        disabled={disabled}
        onValueChange={onValueChange}
        value={value}
      >
        <SelectPrimitive.Trigger
          aria-label={ariaLabel ?? label}
          className={cn(
            "xr-select-trigger inline-flex h-10 min-w-[8.5rem] max-w-full items-center justify-between gap-2 rounded-[var(--xr-radius-md)] border border-input bg-background px-3 text-sm font-medium text-foreground shadow-sm outline-none transition-[background-color,border-color,box-shadow] focus-visible:ring-4 focus-visible:ring-ring/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
            triggerClassName,
          )}
        >
          <span className="xr-select-value truncate">
            <SelectPrimitive.Value placeholder={placeholder}>
              {selectedOption?.label}
            </SelectPrimitive.Value>
          </span>
          <SelectPrimitive.Icon
            aria-hidden="true"
            className="text-muted-foreground"
          >
            ▾
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            className="xr-select-content z-50 max-h-72 min-w-[8.5rem] overflow-hidden rounded-[var(--xr-radius-md)] border border-border bg-popover p-1 text-popover-foreground shadow-[var(--xr-shadow-lg)]"
            position="popper"
            sideOffset={6}
          >
            <SelectPrimitive.Viewport>
              {options.map((option) => (
                <SelectPrimitive.Item
                  className="xr-select-item relative flex cursor-default select-none items-center rounded-[var(--xr-radius-md)] px-3 py-2 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[state=checked]:font-semibold data-[state=checked]:text-primary"
                  data-value={option.value}
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
