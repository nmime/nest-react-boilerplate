import type { ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { UiButton } from "../component/button";
import { UiStatusPill } from "../component/status-pill";
import {
  LanguageSwitcher,
  ThemeSwitcher,
  useI18n,
} from "../i18n/i18n-provider";
import { useOptionalRootStore } from "../state";

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
  homeHref?: string;
  actions: ProductShellAction[];
  children: ReactNode;
}

export const ProductShell = observer(function ProductShell({
  appName,
  eyebrow,
  title,
  description,
  status,
  statusTone = "info",
  homeHref = "/",
  actions,
  children,
}: Readonly<ProductShellProps>) {
  const { t } = useI18n();
  const uiStore = useOptionalRootStore()?.ui;

  return (
    <main
      className="xr-shell"
      data-sidebar-open={uiStore?.sidebarOpen ?? false}
      data-theme={uiStore?.theme ?? "system"}
    >
      <header className="xr-header">
        <a
          aria-label={t("common.homeLink", { appName })}
          className="xr-brand"
          href={homeHref}
        >
          <span className="xr-brand__mark">xR</span>
          <span>{appName}</span>
        </a>
        <div className="xr-header__controls">
          <LanguageSwitcher />
          <ThemeSwitcher />
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
});
