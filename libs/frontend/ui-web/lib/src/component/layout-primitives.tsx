/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import type { HTMLAttributes } from "react";
import { cn } from "../utils/cn";

export interface UiActionGroupProps extends HTMLAttributes<HTMLDivElement> {
  align?: "start" | "center" | "end" | "between";
  density?: "compact" | "comfortable";
  wrap?: boolean;
}

export const UiActionGroup = ({
  align = "start",
  className,
  density = "comfortable",
  wrap = true,
  ...props
}: Readonly<UiActionGroupProps>) => (
  <div
    className={cn(
      "xr-action-group",
      `xr-action-group--${align}`,
      `xr-action-group--${density}`,
      wrap && "xr-action-group--wrap",
      className,
    )}
    data-ui="action-group"
    {...props}
  />
);

export const UiShellSurface = ({
  className,
  ...props
}: Readonly<HTMLAttributes<HTMLElement>>) => (
  <section className={cn("xr-shell-surface", className)} {...props} />
);
