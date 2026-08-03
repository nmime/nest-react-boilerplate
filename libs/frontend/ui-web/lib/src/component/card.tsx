/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import { useId, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../util/cn';

export type CardProps = HTMLAttributes<HTMLDivElement>;

export const Card = ({ className, ...props }: Readonly<CardProps>) => (
  <div
    className={cn(
      'xr-card min-w-0 rounded-[var(--xr-radius-lg)] border border-border bg-card p-5 text-card-foreground shadow-sm transition-[border-color,box-shadow,transform] focus-within:ring-4 focus-within:ring-ring/20',
      className,
    )}
    data-slot="card"
    {...props}
  />
);

export type CardHeaderProps = HTMLAttributes<HTMLDivElement>;

export const CardHeader = ({ className, ...props }: Readonly<CardHeaderProps>) => (
  <div className={cn('xr-card__header grid gap-1.5', className)} data-slot="card-header" {...props} />
);

export interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  /**
   * Mirrors {@link UiSection}'s `headingLevel`. Defaults to 3, which is correct
   * under the default `h2` section: defaulting to 2 instead flattened the
   * outline into sibling `h2`s, and on the auth callback pages — which pass the
   * same translation key to both the section and the card — produced two
   * identical `h2`s. Pass 2 for a card whose section renders an `h1`.
   */
  headingLevel?: 2 | 3;
}

export const CardTitle = ({ children, className, headingLevel = 3, ...props }: Readonly<CardTitleProps>) => {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';

  return (
    <Heading
      className={cn('xr-card__title m-0 text-base font-semibold text-foreground', className)}
      data-slot="card-title"
      {...props}
    >
      {children}
    </Heading>
  );
};

export type CardDescriptionProps = HTMLAttributes<HTMLParagraphElement>;

export const CardDescription = ({ className, ...props }: Readonly<CardDescriptionProps>) => (
  <p className={cn('m-0 text-sm leading-7 text-muted-foreground', className)} data-slot="card-description" {...props} />
);

export type CardContentProps = HTMLAttributes<HTMLDivElement>;

export const CardContent = ({ className, ...props }: Readonly<CardContentProps>) => (
  <div className={cn('xr-card__body leading-7 text-muted-foreground', className)} data-slot="card-content" {...props} />
);

export type CardFooterProps = HTMLAttributes<HTMLDivElement>;

export const CardFooter = ({ className, ...props }: Readonly<CardFooterProps>) => (
  <div className={cn('xr-card__footer flex items-center gap-3', className)} data-slot="card-footer" {...props} />
);

export interface UiCardProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  /** Forwarded to {@link CardTitle}; see its `headingLevel` for the default. */
  headingLevel?: 2 | 3;
  title?: string;
  titleId?: string;
}

export const UiCard = ({ children, className, headingLevel, title, titleId, ...props }: Readonly<UiCardProps>) => {
  const generatedTitleId = useId();
  const headingId = title ? (titleId ?? generatedTitleId) : undefined;
  const { 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy, ...articleProps } = props;

  return (
    <article
      {...articleProps}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy ?? (ariaLabel ? undefined : headingId)}
      className={cn(
        'xr-card min-w-0 flex-1 basis-60 rounded-[var(--xr-radius-lg)] border border-border bg-card p-5 text-card-foreground shadow-sm transition-[border-color,box-shadow,transform] focus-within:ring-4 focus-within:ring-ring/20',
        className,
      )}
      data-slot="card"
    >
      {title ? (
        <CardTitle headingLevel={headingLevel} id={headingId}>
          {title}
        </CardTitle>
      ) : null}
      <CardContent>{children}</CardContent>
    </article>
  );
};
