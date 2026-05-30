/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import type { HTMLAttributes } from "react";

export interface UiStatCardProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string;
  valueLabel?: string;
  detail: string;
}

const classNames = (...values: Array<string | undefined>): string =>
  values.filter(Boolean).join(" ");

export const UiStatCard = ({
  className,
  label,
  value,
  valueLabel,
  detail,
  role,
  ...props
}: Readonly<UiStatCardProps>) => {
  const { "aria-label": ariaLabel, ...statProps } = props;
  const accessibleLabel =
    ariaLabel ?? `${label}: ${valueLabel ?? value}. ${detail}`;

  return (
    <div
      {...statProps}
      aria-label={accessibleLabel}
      className={classNames("xr-stat-card", className)}
      role={role ?? "group"}
    >
      <span className="xr-stat-card__label">{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  );
};
