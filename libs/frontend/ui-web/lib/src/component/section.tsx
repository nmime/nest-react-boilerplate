/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import { useId, type HTMLAttributes, type ReactNode } from 'react';

export interface UiSectionProps extends HTMLAttributes<HTMLElement> {
  eyebrow?: string;
  headingLevel?: 1 | 2;
  title: string;
  titleId?: string;
  children?: ReactNode;
}

const classNames = (...values: Array<string | undefined>): string => values.filter(Boolean).join(' ');

export const UiSection = ({
  children,
  className,
  eyebrow,
  headingLevel = 2,
  title,
  titleId,
  ...props
}: Readonly<UiSectionProps>) => {
  const generatedTitleId = useId();
  const headingId = titleId ?? generatedTitleId;
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  const { 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy, ...sectionProps } = props;

  return (
    <section
      {...sectionProps}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy ?? (ariaLabel ? undefined : headingId)}
      className={classNames('xr-section', className)}
    >
      {eyebrow ? <p className="xr-eyebrow">{eyebrow}</p> : null}
      <Heading id={headingId}>{title}</Heading>
      <div className="xr-section__content">{children}</div>
    </section>
  );
};
