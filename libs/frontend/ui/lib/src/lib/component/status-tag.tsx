/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import type { HTMLAttributes } from "react";
import { cn } from "../utils/cn";

export interface UiStatusTagProps extends HTMLAttributes<HTMLSpanElement> {
  label: string;
  tone?: "neutral" | "info" | "success" | "warning";
}

export const UiStatusTag = ({
  className,
  label,
  tone = "neutral",
  ...props
}: Readonly<UiStatusTagProps>) => (
  <span
    {...props}
    className={cn("xr-status-tag", `xr-status-tag--${tone}`, className)}
    data-admin-primitive="status-tag"
    data-tone={tone}
  >
    {label}
  </span>
);
