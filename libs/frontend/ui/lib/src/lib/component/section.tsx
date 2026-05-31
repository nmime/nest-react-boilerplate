/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import { useId, type HTMLAttributes, type ReactNode } from "react";

export interface UiSectionProps extends HTMLAttributes<HTMLElement> {
  eyebrow?: string;
  title: string;
  titleId?: string;
  children?: ReactNode;
}

const classNames = (...values: Array<string | undefined>): string =>
  values.filter(Boolean).join(" ");

export const UiSection = ({
  children,
  className,
  eyebrow,
  title,
  titleId,
  ...props
}: Readonly<UiSectionProps>) => {
  const generatedTitleId = useId();
  const headingId = titleId ?? generatedTitleId;
  const {
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
    ...sectionProps
  } = props;

  return (
    <section
      {...sectionProps}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy ?? (ariaLabel ? undefined : headingId)}
      className={classNames("xr-section", className)}
    >
      {eyebrow ? <p className="xr-eyebrow">{eyebrow}</p> : null}
      <h2 id={headingId}>{title}</h2>
      <div className="xr-section__content">{children}</div>
    </section>
  );
};
