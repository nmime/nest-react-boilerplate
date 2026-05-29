import type { HTMLAttributes } from "react";

export interface UiStatusPillProps extends HTMLAttributes<HTMLSpanElement> {
  label: string;
  live?: "off" | "polite" | "assertive";
  tone?: "success" | "info" | "warning";
}

const classNames = (...values: Array<string | undefined>): string =>
  values.filter(Boolean).join(" ");

export const UiStatusPill = ({
  className,
  label,
  live = "off",
  role,
  tone = "info",
  ...props
}: Readonly<UiStatusPillProps>) => (
  <span
    {...props}
    aria-live={live === "off" ? undefined : live}
    className={classNames("xr-status", `xr-status--${tone}`, className)}
    data-tone={tone}
    role={role ?? (live === "off" ? undefined : "status")}
  >
    {label}
  </span>
);
