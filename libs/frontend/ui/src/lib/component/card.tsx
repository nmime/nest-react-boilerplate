import type { HTMLAttributes, ReactNode } from "react";

export interface UiCardProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  title?: string;
}

export const UiCard = ({
  children,
  className,
  title,
  ...props
}: Readonly<UiCardProps>) => (
  <article
    className={["xr-card", className].filter(Boolean).join(" ")}
    {...props}
  >
    {title ? <h3 className="xr-card__title">{title}</h3> : null}
    <div className="xr-card__body">{children}</div>
  </article>
);
