import type { ReactNode } from "react";

export interface UiSectionProps {
  eyebrow?: string;
  title: string;
  children: ReactNode;
}

export const UiSection = ({
  eyebrow,
  title,
  children,
}: Readonly<UiSectionProps>) => (
  <section className="xr-section">
    {eyebrow ? <p className="xr-eyebrow">{eyebrow}</p> : null}
    <h2>{title}</h2>
    <div className="xr-section__content">{children}</div>
  </section>
);
