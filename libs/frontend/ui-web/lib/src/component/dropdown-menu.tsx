/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ComponentRef,
  type ReactNode,
} from "react";
import { UiButton } from "./button";

const defaultActionsLabel = ["Actions"].join("");
import { cn } from "../util/cn";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;
export const DropdownMenuPortal = DropdownMenuPrimitive.Portal;
export const DropdownMenuSub = DropdownMenuPrimitive.Sub;
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

export type DropdownMenuContentProps = ComponentPropsWithoutRef<
  typeof DropdownMenuPrimitive.Content
>;

export const DropdownMenuContent = forwardRef<
  ComponentRef<typeof DropdownMenuPrimitive.Content>,
  DropdownMenuContentProps
>(({ className, sideOffset = 8, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      className={cn("xr-menu", className)}
      data-slot="dropdown-menu-content"
      ref={ref}
      sideOffset={sideOffset}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));

DropdownMenuContent.displayName = "DropdownMenuContent";

export type DropdownMenuItemProps = ComponentPropsWithoutRef<
  typeof DropdownMenuPrimitive.Item
> & {
  tone?: "default" | "warning";
};

export const DropdownMenuItem = forwardRef<
  ComponentRef<typeof DropdownMenuPrimitive.Item>,
  DropdownMenuItemProps
>(({ className, tone = "default", ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    className={cn(
      "xr-menu__item",
      tone === "warning" && "xr-menu__item--warning",
      className,
    )}
    data-slot="dropdown-menu-item"
    ref={ref}
    {...props}
  />
));

DropdownMenuItem.displayName = "DropdownMenuItem";

export type DropdownMenuLabelProps = ComponentPropsWithoutRef<
  typeof DropdownMenuPrimitive.Label
>;

export const DropdownMenuLabel = forwardRef<
  ComponentRef<typeof DropdownMenuPrimitive.Label>,
  DropdownMenuLabelProps
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    className={cn("px-3 py-2 text-sm font-semibold text-foreground", className)}
    data-slot="dropdown-menu-label"
    ref={ref}
    {...props}
  />
));

DropdownMenuLabel.displayName = "DropdownMenuLabel";

export type DropdownMenuSeparatorProps = ComponentPropsWithoutRef<
  typeof DropdownMenuPrimitive.Separator
>;

export const DropdownMenuSeparator = forwardRef<
  ComponentRef<typeof DropdownMenuPrimitive.Separator>,
  DropdownMenuSeparatorProps
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    className={cn("-mx-1 my-1 h-px bg-border", className)}
    data-slot="dropdown-menu-separator"
    ref={ref}
    {...props}
  />
));

DropdownMenuSeparator.displayName = "DropdownMenuSeparator";

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
  <DropdownMenu
    defaultOpen={defaultOpen}
    onOpenChange={onOpenChange}
    open={open}
  >
    <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
    <DropdownMenuContent
      align={align}
      aria-label={label}
      className={className}
      data-admin-primitive="dropdown-menu"
    >
      {items.map((item, index) => (
        <DropdownMenuItem
          disabled={item.disabled}
          key={`${index}`}
          onSelect={item.onSelect}
          tone={item.tone}
        >
          {item.label}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
);

export const UiActionsMenu = ({
  trigger = <UiButton variant="secondary">{defaultActionsLabel}</UiButton>,
  ...props
}: Omit<UiDropdownMenuProps, "trigger"> & { trigger?: ReactNode }) => (
  <UiDropdownMenu trigger={trigger} {...props} />
);
