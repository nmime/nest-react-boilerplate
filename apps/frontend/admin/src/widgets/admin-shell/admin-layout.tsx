import { type ReactNode } from "react";
import {
  ProductShell,
  UiStatusTag,
  useI18n,
  type ProductShellAction,
} from "@app/frontend/ui";
import type { AdminAccess } from "../../entities/admin-session";
import { normalizeAdminPath } from "../../shared";

interface AdminNavItem extends ProductShellAction {
  detail: string;
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
  const navItems: AdminNavItem[] = [
    (access?.canReadDashboard ?? true)
      ? {
          href: "/admin",
          isCurrent: path === "/" || path === "/dashboard",
          label: t("admin.action.dashboard"),
          detail: t("admin.dashboard.description"),
        }
      : undefined,
    access?.canReadUsers
      ? {
          href: "/admin/users",
          isCurrent: path.startsWith("/users"),
          label: t("admin.action.users"),
          detail: t("admin.dashboard.card.visibility.description"),
          variant: "secondary" as const,
        }
      : undefined,
    access?.canReadRoles
      ? {
          href: "/admin/roles",
          isCurrent: path === "/roles",
          label: t("admin.action.roles"),
          detail: t("admin.roles.title"),
          variant: "secondary" as const,
        }
      : undefined,
    access?.canReadAudit
      ? {
          href: "/admin/audit",
          isCurrent: path === "/audit",
          label: t("admin.action.audit"),
          detail: t("admin.dashboard.summary.recentAuditDetail"),
          variant: "secondary" as const,
        }
      : undefined,
    access?.canReadRoles
      ? {
          href: "/admin/tenants",
          isCurrent: path === "/tenants",
          label: t("admin.tenants.title"),
          detail: t("admin.tenants.description"),
          variant: "secondary" as const,
        }
      : undefined,
    (access?.canReadProfile ?? true)
      ? {
          href: "/admin/profile",
          isCurrent: path === "/profile",
          label: t("admin.action.profile"),
          detail: t("admin.dashboard.stat.profile.detail"),
          variant: "secondary" as const,
        }
      : undefined,
  ].filter((item): item is AdminNavItem => Boolean(item));
  const currentItem = navItems.find((item) => item.isCurrent);

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
            {navItems.map((item) => (
              <a
                aria-current={item.isCurrent ? "page" : undefined}
                className="admin-sidebar__link"
                data-current={item.isCurrent ? "true" : "false"}
                href={item.href}
                key={item.href}
              >
                <span className="admin-sidebar__indicator" />
                <span className="admin-sidebar__label">{item.label}</span>
                <small>{item.detail}</small>
              </a>
            ))}
          </nav>
        </aside>
        <section
          aria-label={currentItem?.label ?? t("admin.title")}
          className="admin-main-panel"
        >
          {children}
        </section>
      </div>
    </ProductShell>
  );
};
