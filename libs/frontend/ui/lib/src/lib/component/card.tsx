import { useId, type HTMLAttributes, type ReactNode } from "react";

export interface UiCardProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  title?: string;
  titleId?: string;
}

const classNames = (...values: Array<string | undefined>): string =>
  values.filter(Boolean).join(" ");

export const UiCard = ({
  children,
  className,
  title,
  titleId,
  ...props
}: Readonly<UiCardProps>) => {
  const generatedTitleId = useId();
  const headingId = title ? (titleId ?? generatedTitleId) : undefined;
  const {
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
    ...articleProps
  } = props;

  return (
    <article
      {...articleProps}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy ?? (ariaLabel ? undefined : headingId)}
      className={classNames("xr-card", className)}
    >
      {title ? (
        <h3 className="xr-card__title" id={headingId}>
          {title}
        </h3>
      ) : null}
      <div className="xr-card__body">{children}</div>
    </article>
  );
};
