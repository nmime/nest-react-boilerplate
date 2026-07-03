/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../utils/cn";

export interface UiResourceErrorProps extends HTMLAttributes<HTMLElement> {
  action?: ReactNode;
  children?: ReactNode;
  description?: string;
  title?: string;
}

export const UiResourceError = ({
  action,
  children,
  className,
  description = "The resource could not be loaded. Check your connection and try again.",
  role,
  title = "Resource unavailable",
  ...props
}: Readonly<UiResourceErrorProps>) => (
  <section
    {...props}
    aria-live="assertive"
    className={cn("xr-resource-error", className)}
    data-admin-primitive="resource-error"
    role={role ?? "alert"}
  >
    <div className="xr-resource-error__copy">
      <h2>{title}</h2>
      <p>{description}</p>
      {children}
    </div>
    {action ? <div className="xr-resource-error__action">{action}</div> : null}
  </section>
);
