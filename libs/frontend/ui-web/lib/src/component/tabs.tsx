/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import * as TabsPrimitive from "@radix-ui/react-tabs";
import type { ReactNode } from "react";
import { cn } from "../utils/cn";

export interface UiTabItem {
  content: ReactNode;
  disabled?: boolean;
  label: ReactNode;
  value: string;
}

export interface UiTabsProps {
  className?: string;
  defaultValue?: string;
  items: readonly UiTabItem[];
  label?: string;
  onValueChange?: (value: string) => void;
  value?: string;
}

export const UiTabs = ({
  className,
  defaultValue,
  items,
  label = "Sections",
  onValueChange,
  value,
}: Readonly<UiTabsProps>) => {
  const resolvedDefaultValue = defaultValue ?? items[0]?.value;

  return (
    <TabsPrimitive.Root
      className={cn("xr-tabs", className)}
      data-admin-primitive="tabs"
      defaultValue={resolvedDefaultValue}
      onValueChange={onValueChange}
      value={value}
    >
      <TabsPrimitive.List aria-label={label} className="xr-tabs__list">
        {items.map((item) => (
          <TabsPrimitive.Trigger
            className="xr-tabs__trigger"
            disabled={item.disabled}
            key={item.value}
            value={item.value}
          >
            {item.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {items.map((item) => (
        <TabsPrimitive.Content
          className="xr-tabs__content"
          key={item.value}
          value={item.value}
        >
          {item.content}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
};
