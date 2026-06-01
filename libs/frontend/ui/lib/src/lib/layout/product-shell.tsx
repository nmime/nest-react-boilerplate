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
  isCurrent?: boolean;
}

export interface ProductShellProps {
  appName: string;
  eyebrow: string;
  title: string;
  description: string;
  status: string;
  statusTone?: "success" | "info" | "warning";
  homeHref?: string;
  actionsLabel?: string;
  skipLinkLabel?: string;
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
  actionsLabel,
  skipLinkLabel,
  actions,
  children,
}: Readonly<ProductShellProps>) {
  const { locale } = useI18n();
  const uiStore = useOptionalRootStore()?.ui;
  const defaultLabels =
    locale === "ru"
      ? {
          actionsLabel: `Навигация ${appName}`,
          homeLinkLabel: `Домой в ${appName}`,
          skipLinkLabel: "Перейти к содержимому",
        }
      : {
          actionsLabel: `${appName} navigation`,
          homeLinkLabel: `${appName} home`,
          skipLinkLabel: "Skip to content",
        };
  const resolvedActionsLabel = actionsLabel ?? defaultLabels.actionsLabel;
  const resolvedSkipLinkLabel = skipLinkLabel ?? defaultLabels.skipLinkLabel;
  const resolvedHomeLinkLabel = defaultLabels.homeLinkLabel;

  return (
    <>
      <a className="xr-skip-link" href="#xr-content">
        {resolvedSkipLinkLabel}
      </a>
      <main
        className="xr-shell"
        data-sidebar-open={uiStore?.sidebarOpen ?? false}
        data-theme={uiStore?.theme ?? "system"}
      >
        <header className="xr-header">
          <a
            aria-label={resolvedHomeLinkLabel}
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
            <nav aria-label={resolvedActionsLabel} className="xr-actions">
              {actions.map((action) => (
                <UiButton
                  aria-current={action.isCurrent ? "page" : undefined}
                  href={action.href}
                  key={action.label}
                  variant={action.variant}
                >
                  {action.label}
                </UiButton>
              ))}
            </nav>
          </div>
        </section>

        <div className="xr-content" id="xr-content" tabIndex={-1}>
          {children}
        </div>
      </main>
    </>
  );
});
