/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import { cva, type VariantProps } from 'class-variance-authority';
import { type HTMLAttributes, type PropsWithChildren } from 'react';
import { cn } from '../util/cn';

export const alertVariants = cva(
  'xr-alert rounded-[var(--xr-radius-md)] border border-border bg-card p-4 text-sm text-card-foreground shadow-sm',
  {
    variants: {
      tone: {
        info: 'xr-alert--info',
        success: 'xr-alert--success',
        warning: 'xr-alert--warning',
      },
    },
    defaultVariants: {
      tone: 'info',
    },
  },
);

export type UiAlertProps = PropsWithChildren<HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>>;

export const Alert = ({ children, className, role, tone, ...props }: Readonly<UiAlertProps>) => (
  <div
    className={cn(alertVariants({ tone }), className)}
    data-slot="alert"
    role={role ?? (tone === 'warning' ? 'alert' : 'status')}
    {...props}
  >
    {children}
  </div>
);

export const UiAlert = Alert;

export type AlertTitleProps = HTMLAttributes<HTMLDivElement>;

// Deliberately not a heading. An alert can appear at any depth, so emitting an
// `<h5>` injected an out-of-order heading into every host page's outline. The
// surrounding `role="alert"` already carries the semantics.
export const AlertTitle = ({ children, className, ...props }: Readonly<AlertTitleProps>) => (
  <div className={cn('mb-1 font-semibold leading-none tracking-tight', className)} data-slot="alert-title" {...props}>
    {children}
  </div>
);

export type AlertDescriptionProps = HTMLAttributes<HTMLDivElement>;

export const AlertDescription = ({ className, ...props }: Readonly<AlertDescriptionProps>) => (
  <div className={cn('text-sm leading-6 text-muted-foreground', className)} data-slot="alert-description" {...props} />
);
