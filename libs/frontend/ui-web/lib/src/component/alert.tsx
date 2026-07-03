/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import { cva, type VariantProps } from "class-variance-authority";
import { type HTMLAttributes, type PropsWithChildren } from "react";
import { cn } from "../utils/cn";

const alertVariants = cva(
  "xr-alert rounded-[var(--xr-radius-md)] border border-border bg-card p-4 text-sm text-card-foreground shadow-sm",
  {
    variants: {
      tone: {
        info: "xr-alert--info",
        success: "xr-alert--success",
        warning: "xr-alert--warning",
      },
    },
    defaultVariants: {
      tone: "info",
    },
  },
);

export type UiAlertProps = PropsWithChildren<
  HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>;

export const UiAlert = ({
  children,
  className,
  role,
  tone,
  ...props
}: Readonly<UiAlertProps>) => (
  <div
    className={cn(alertVariants({ tone }), className)}
    role={role ?? (tone === "warning" ? "alert" : "status")}
    {...props}
  >
    {children}
  </div>
);
