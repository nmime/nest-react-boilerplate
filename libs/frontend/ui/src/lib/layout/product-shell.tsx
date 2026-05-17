import type { ReactNode } from "react";
import { UiButton } from "../component/button";
import { UiStatusPill } from "../component/status-pill";
import { LanguageSwitcher } from "../i18n/i18n-provider";

export interface ProductShellAction {
  label: string;
  href: string;
  variant?: "primary" | "secondary";
}

export interface ProductShellProps {
  appName: string;
  eyebrow: string;
  title: string;
  description: string;
  status: string;
  statusTone?: "success" | "info" | "warning";
  actions: ProductShellAction[];
  children: ReactNode;
}

export const ProductShell = ({
  appName,
  eyebrow,
  title,
  description,
  status,
  statusTone = "info",
  actions,
  children,
}: Readonly<ProductShellProps>) => (
  <main className="xr-shell">
    <header className="xr-header">
      <a className="xr-brand" href="/" aria-label={`${appName} home`}>
        <span className="xr-brand__mark">xR</span>
        <span>{appName}</span>
      </a>
      <div className="xr-header__controls">
        <LanguageSwitcher />
        <UiStatusPill label={status} tone={statusTone} />
      </div>
    </header>

    <section className="xr-hero">
      <div className="xr-hero__copy">
        <p className="xr-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="xr-hero__description">{description}</p>
        <div className="xr-actions">
          {actions.map((action) => (
            <UiButton
              href={action.href}
              key={action.label}
              variant={action.variant}
            >
              {action.label}
            </UiButton>
          ))}
        </div>
      </div>
    </section>

    <div className="xr-content">{children}</div>
  </main>
);
