/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import * as LabelPrimitive from "@radix-ui/react-label";
import { type ComponentPropsWithoutRef } from "react";
import { cn } from "../utils/cn";

export type UiLabelProps = ComponentPropsWithoutRef<typeof LabelPrimitive.Root>;

export const UiLabel = ({ className, ...props }: Readonly<UiLabelProps>) => (
  <LabelPrimitive.Root
    className={cn(
      "xr-field__label text-sm font-medium leading-none text-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
      className,
    )}
    {...props}
  />
);
