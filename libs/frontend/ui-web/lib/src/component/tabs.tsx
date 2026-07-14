/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { forwardRef, type ComponentPropsWithoutRef, type ComponentRef, type ReactNode } from 'react';
import { cn } from '../util/cn';

export const Tabs = TabsPrimitive.Root;

export type TabsListProps = ComponentPropsWithoutRef<typeof TabsPrimitive.List>;

export const TabsList = forwardRef<ComponentRef<typeof TabsPrimitive.List>, TabsListProps>(
  ({ className, ...props }, ref) => (
    <TabsPrimitive.List className={cn('xr-tabs__list', className)} data-slot="tabs-list" ref={ref} {...props} />
  ),
);

TabsList.displayName = 'TabsList';

export type TabsTriggerProps = ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>;

export const TabsTrigger = forwardRef<ComponentRef<typeof TabsPrimitive.Trigger>, TabsTriggerProps>(
  ({ className, ...props }, ref) => (
    <TabsPrimitive.Trigger
      className={cn('xr-tabs__trigger', className)}
      data-slot="tabs-trigger"
      ref={ref}
      {...props}
    />
  ),
);

TabsTrigger.displayName = 'TabsTrigger';

export type TabsContentProps = ComponentPropsWithoutRef<typeof TabsPrimitive.Content>;

export const TabsContent = forwardRef<ComponentRef<typeof TabsPrimitive.Content>, TabsContentProps>(
  ({ className, ...props }, ref) => (
    <TabsPrimitive.Content
      className={cn('xr-tabs__content', className)}
      data-slot="tabs-content"
      ref={ref}
      {...props}
    />
  ),
);

TabsContent.displayName = 'TabsContent';

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
  label = 'Sections',
  onValueChange,
  value,
}: Readonly<UiTabsProps>) => {
  const resolvedDefaultValue = defaultValue ?? items[0]?.value;

  return (
    <Tabs
      className={cn('xr-tabs', className)}
      data-admin-primitive="tabs"
      data-slot="tabs"
      defaultValue={resolvedDefaultValue}
      onValueChange={onValueChange}
      value={value}
    >
      <TabsList aria-label={label}>
        {items.map((item) => (
          <TabsTrigger disabled={item.disabled} key={item.value} value={item.value}>
            {item.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {items.map((item) => (
        <TabsContent key={item.value} value={item.value}>
          {item.content}
        </TabsContent>
      ))}
    </Tabs>
  );
};
