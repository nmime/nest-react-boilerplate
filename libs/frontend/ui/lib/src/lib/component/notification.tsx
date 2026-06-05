/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import type { HTMLAttributes, ReactNode } from "react";
import { UiButton } from "./button";
import { cn } from "../utils/cn";

export interface UiNotificationProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "title"
> {
  action?: ReactNode;
  message: ReactNode;
  title?: ReactNode;
  tone?: "info" | "success" | "warning";
}

export const UiNotification = ({
  action,
  className,
  message,
  role,
  title,
  tone = "info",
  ...props
}: Readonly<UiNotificationProps>) => (
  <div
    {...props}
    aria-live={tone === "warning" ? "assertive" : "polite"}
    className={cn("xr-notification", `xr-notification--${tone}`, className)}
    data-admin-primitive="notification"
    role={role ?? (tone === "warning" ? "alert" : "status")}
  >
    <div className="xr-notification__copy">
      {title ? <strong>{title}</strong> : null}
      <div>{message}</div>
    </div>
    {action ? <div className="xr-notification__action">{action}</div> : null}
  </div>
);

export interface UiCopyableTextProps {
  className?: string;
  copiedLabel?: string;
  label?: string;
  value: string;
}

export const UiCopyableText = ({
  className,
  copiedLabel = "Copied",
  label = "Copy value",
  value,
}: Readonly<UiCopyableTextProps>) => {
  const handleCopy = () => {
    void globalThis.navigator?.clipboard?.writeText(value);
  };

  return (
    <span
      className={cn("xr-copyable", className)}
      data-admin-primitive="copyable-text"
    >
      <code>{value}</code>
      <UiButton
        aria-label={`${label}: ${value}`}
        className="xr-copyable__button"
        onClick={handleCopy}
        title={copiedLabel}
        variant="secondary"
      >
        Copy
      </UiButton>
    </span>
  );
};
