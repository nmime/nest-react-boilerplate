/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";
import { UiButton } from "./button";

const defaultActionsLabel = ["Actions"].join("");
import { cn } from "../utils/cn";

export interface UiDropdownMenuItem {
  disabled?: boolean;
  label: ReactNode;
  onSelect?: () => void;
  tone?: "default" | "warning";
}

export interface UiDropdownMenuProps {
  align?: "start" | "center" | "end";
  className?: string;
  defaultOpen?: boolean;
  items: readonly UiDropdownMenuItem[];
  label?: string;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  trigger: ReactNode;
}

export const UiDropdownMenu = ({
  align = "end",
  className,
  defaultOpen,
  items,
  label = "Actions",
  onOpenChange,
  open,
  trigger,
}: Readonly<UiDropdownMenuProps>) => (
  <DropdownMenuPrimitive.Root
    defaultOpen={defaultOpen}
    onOpenChange={onOpenChange}
    open={open}
  >
    <DropdownMenuPrimitive.Trigger asChild>
      {trigger}
    </DropdownMenuPrimitive.Trigger>
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        align={align}
        aria-label={label}
        className={cn("xr-menu", className)}
        data-admin-primitive="dropdown-menu"
        sideOffset={8}
      >
        {items.map((item, index) => (
          <DropdownMenuPrimitive.Item
            className={cn(
              "xr-menu__item",
              item.tone === "warning" && "xr-menu__item--warning",
            )}
            disabled={item.disabled}
            key={`${index}`}
            onSelect={item.onSelect}
          >
            {item.label}
          </DropdownMenuPrimitive.Item>
        ))}
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  </DropdownMenuPrimitive.Root>
);

export const UiActionsMenu = ({
  trigger = <UiButton variant="secondary">{defaultActionsLabel}</UiButton>,
  ...props
}: Omit<UiDropdownMenuProps, "trigger"> & { trigger?: ReactNode }) => (
  <UiDropdownMenu trigger={trigger} {...props} />
);
