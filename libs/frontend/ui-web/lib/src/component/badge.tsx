/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../util/cn';

export interface UiBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children?: ReactNode;
  label?: ReactNode;
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'destructive';
  variant?: 'soft' | 'outline' | 'solid';
}

export const Badge = ({
  children,
  className,
  label,
  tone = 'neutral',
  variant = 'soft',
  ...props
}: Readonly<UiBadgeProps>) => (
  <span
    {...props}
    className={cn('xr-badge', `xr-badge--${tone}`, `xr-badge--${variant}`, className)}
    data-slot="badge"
    data-tone={tone}
    data-variant={variant}
  >
    {label ?? children}
  </span>
);

export type BadgeProps = UiBadgeProps;
export const UiBadge = Badge;
