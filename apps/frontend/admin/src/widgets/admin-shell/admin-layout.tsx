import { type ReactNode } from "react";
import {
  ProductShell,
  UiStatusTag,
  useI18n,
  type ProductShellAction,
} from "@app/frontend/ui";
import type { AdminAccess } from "../../entities/admin-session";
import { normalizeAdminPath } from "../../shared";

interface AdminNavItem extends Omit<ProductShellAction, "isCurrent"> {
  detail: string;
  isCurrent: boolean;
}

export const AdminLayout = ({
  access,
  children,
  currentPath = "/",
}: Readonly<{
  access?: AdminAccess;
  children: ReactNode;
  currentPath?: string;
}>) => {
  const { t } = useI18n();
  const path = normalizeAdminPath(currentPath);
  const navItems: AdminNavItem[] = [];

  if (access?.canReadDashboard ?? true) {
    navItems.push({
      href: "/admin",
      isCurrent: path === "/" || path === "/dashboard",
      label: t("admin.action.dashboard"),
      detail: t("admin.dashboard.description"),
    });
  }
  if (access?.canReadUsers) {
    navItems.push({
      href: "/admin/users",
      isCurrent: path.startsWith("/users"),
      label: t("admin.action.users"),
      detail: t("admin.dashboard.card.visibility.description"),
      variant: "secondary",
    });
  }
  if (access?.canReadRoles) {
    navItems.push({
      href: "/admin/roles",
      isCurrent: path === "/roles",
      label: t("admin.action.roles"),
      detail: t("admin.roles.title"),
      variant: "secondary",
    });
  }
  if (access?.canReadAudit) {
    navItems.push({
      href: "/admin/audit",
      isCurrent: path === "/audit",
      label: t("admin.action.audit"),
      detail: t("admin.dashboard.summary.recentAuditDetail"),
      variant: "secondary",
    });
  }
  if (access?.canReadRoles) {
    navItems.push({
      href: "/admin/tenants",
      isCurrent: path === "/tenants",
      label: t("admin.tenants.title"),
      detail: t("admin.tenants.description"),
      variant: "secondary",
    });
  }
  if (access?.canReadProfile ?? true) {
    navItems.push({
      href: "/admin/profile",
      isCurrent: path === "/profile",
      label: t("admin.action.profile"),
      detail: t("admin.dashboard.stat.profile.detail"),
      variant: "secondary",
    });
  }
  const currentItem = navItems.find((item) => item.isCurrent);
  const routeSignals = [
    {
      label: "RBAC fail-closed",
      tone: access?.canAccessAdmin === false ? "warning" : "success",
    },
    {
      label: `${navItems.length} scoped routes`,
      tone: "info",
    },
    {
      label: currentItem?.label ?? t("admin.notFound.title"),
      tone: currentItem ? "success" : "warning",
    },
  ] satisfies Array<{
    label: string;
    tone: "info" | "success" | "warning";
  }>;

  return (
    <ProductShell
      actions={navItems.map((item) => ({
        href: item.href,
        isCurrent: item.isCurrent,
        label: item.label,
        variant: item.isCurrent ? "primary" : "secondary",
      }))}
      appName={t("admin.appName")}
      description={t("admin.description")}
      homeHref="/admin"
      eyebrow={t("admin.eyebrow")}
      status={t("admin.status")}
      statusTone="warning"
      title={t("admin.title")}
    >
      <div className="admin-shell">
        <aside className="admin-sidebar" aria-label={t("admin.appName")}>
          <div className="admin-sidebar__card">
            <p className="xr-eyebrow">{t("admin.eyebrow")}</p>
            <strong>{t("admin.title")}</strong>
            <span>{t("admin.description")}</span>
            <UiStatusTag label={t("admin.status")} tone="warning" />
          </div>
          <nav className="admin-sidebar__nav" aria-label={t("admin.appName")}>
            {navItems.map((item, index) => (
              <a
                aria-current={item.isCurrent ? "page" : undefined}
                className="admin-sidebar__link"
                data-current={item.isCurrent ? "true" : "false"}
                href={item.href}
                key={item.href}
              >
                <span className="admin-sidebar__indicator" />
                <span className="admin-sidebar__number">
                  {(index + 1).toString().padStart(2, "0")}
                </span>
                <span className="admin-sidebar__label">{item.label}</span>
                <small>{item.detail}</small>
              </a>
            ))}
          </nav>
          <div className="admin-sidebar__footnote">
            Permission-scoped navigation hides unavailable routes before render.
          </div>
        </aside>
        <section
          aria-label={currentItem?.label ?? t("admin.title")}
          className="admin-main-panel"
        >
          <div
            className="admin-command-bar"
            data-design-version="admin-frontend-v3"
          >
            <div>
              <p className="xr-eyebrow">Admin console v3</p>
              <h2>{currentItem?.label ?? t("admin.notFound.title")}</h2>
              <span>
                Product-ops workspace with guarded routing, quick context, and
                nonblank empty/error/loading states.
              </span>
            </div>
            <div className="admin-command-bar__signals">
              {routeSignals.map((signal) => (
                <UiStatusTag
                  key={signal.label}
                  label={signal.label}
                  tone={signal.tone}
                />
              ))}
            </div>
          </div>
          {children}
        </section>
      </div>
    </ProductShell>
  );
};
