/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import * as SelectPrimitive from "@radix-ui/react-select";
import {
  forwardRef,
  useId,
  type ComponentPropsWithoutRef,
  type ComponentRef,
  type ReactNode,
} from "react";
import { UiLabel } from "./label";
import { cn } from "../util/cn";

export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

export type SelectTriggerProps = ComponentPropsWithoutRef<
  typeof SelectPrimitive.Trigger
>;

export const SelectTrigger = forwardRef<
  ComponentRef<typeof SelectPrimitive.Trigger>,
  SelectTriggerProps
>(({ children, className, ...props }, ref) => (
  <SelectPrimitive.Trigger
    className={cn(
      "xr-select-trigger inline-flex h-10 min-w-[8.5rem] max-w-full items-center justify-between gap-2 rounded-[var(--xr-radius-md)] border border-input bg-background px-3 text-sm font-medium text-foreground shadow-sm outline-none transition-[background-color,border-color,box-shadow] focus-visible:ring-4 focus-visible:ring-ring/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    data-slot="select-trigger"
    ref={ref}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon
      aria-hidden="true"
      className="text-muted-foreground"
      data-slot="select-icon"
    >
      ▾
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));

SelectTrigger.displayName = "SelectTrigger";

export type SelectContentProps = ComponentPropsWithoutRef<
  typeof SelectPrimitive.Content
>;

export const SelectContent = forwardRef<
  ComponentRef<typeof SelectPrimitive.Content>,
  SelectContentProps
>(
  (
    { children, className, position = "popper", sideOffset = 6, ...props },
    ref,
  ) => (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        className={cn(
          "xr-select-content z-50 max-h-72 min-w-[8.5rem] overflow-hidden rounded-[var(--xr-radius-md)] border border-border bg-popover p-1 text-popover-foreground shadow-[var(--xr-shadow-lg)]",
          className,
        )}
        data-slot="select-content"
        position={position}
        ref={ref}
        sideOffset={sideOffset}
        {...props}
      >
        <SelectPrimitive.Viewport data-slot="select-viewport">
          {children}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  ),
);

SelectContent.displayName = "SelectContent";

export type SelectLabelProps = ComponentPropsWithoutRef<
  typeof SelectPrimitive.Label
>;

export const SelectLabel = forwardRef<
  ComponentRef<typeof SelectPrimitive.Label>,
  SelectLabelProps
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    className={cn("px-3 py-2 text-sm font-semibold text-foreground", className)}
    data-slot="select-label"
    ref={ref}
    {...props}
  />
));

SelectLabel.displayName = "SelectLabel";

export type SelectItemProps = ComponentPropsWithoutRef<
  typeof SelectPrimitive.Item
>;

export const SelectItem = forwardRef<
  ComponentRef<typeof SelectPrimitive.Item>,
  SelectItemProps
>(({ children, className, ...props }, ref) => (
  <SelectPrimitive.Item
    className={cn(
      "xr-select-item relative flex cursor-default select-none items-center rounded-[var(--xr-radius-md)] px-3 py-2 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[state=checked]:font-semibold data-[state=checked]:text-primary",
      className,
    )}
    data-slot="select-item"
    ref={ref}
    {...props}
  >
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));

SelectItem.displayName = "SelectItem";

export type SelectSeparatorProps = ComponentPropsWithoutRef<
  typeof SelectPrimitive.Separator
>;

export const SelectSeparator = forwardRef<
  ComponentRef<typeof SelectPrimitive.Separator>,
  SelectSeparatorProps
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    className={cn("-mx-1 my-1 h-px bg-border", className)}
    data-slot="select-separator"
    ref={ref}
    {...props}
  />
));

SelectSeparator.displayName = "SelectSeparator";

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
      <Select disabled={disabled} onValueChange={onValueChange} value={value}>
        <SelectTrigger
          aria-label={ariaLabel ?? label}
          className={triggerClassName}
        >
          <span className="xr-select-value truncate">
            <SelectValue placeholder={placeholder}>
              {selectedOption?.label}
            </SelectValue>
          </span>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem
              data-value={option.value}
              key={option.value}
              value={option.value}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
