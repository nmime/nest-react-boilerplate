import type { ReactNode } from "react";

export interface UiCardProps {
  children: ReactNode;
  title?: string;
}

export const UiCard = ({ children, title }: Readonly<UiCardProps>) => (
  <article className="xr-card">
    {title ? <h3 className="xr-card__title">{title}</h3> : null}
    <div className="xr-card__body">{children}</div>
  </article>
);
