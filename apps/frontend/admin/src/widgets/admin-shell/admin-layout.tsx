import { type ReactNode } from "react";
import { ProductShell, useI18n } from "@app/frontend-ui";
import type { AdminAccess } from "../../entities/admin-session";
import { normalizeAdminPath } from "../../shared";

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
  const actions = [
    (access?.canReadDashboard ?? true)
      ? {
          href: "/admin",
          isCurrent: path === "/" || path === "/dashboard",
          label: t("admin.action.dashboard"),
        }
      : undefined,
    access?.canReadUsers
      ? {
          href: "/admin/users",
          isCurrent: path.startsWith("/users"),
          label: t("admin.action.users"),
          variant: "secondary" as const,
        }
      : undefined,
    access?.canReadRoles
      ? {
          href: "/admin/roles",
          isCurrent: path === "/roles",
          label: t("admin.action.roles"),
          variant: "secondary" as const,
        }
      : undefined,
    access?.canReadAudit
      ? {
          href: "/admin/audit",
          isCurrent: path === "/audit",
          label: t("admin.action.audit"),
          variant: "secondary" as const,
        }
      : undefined,
    (access?.canReadProfile ?? true)
      ? {
          href: "/admin/profile",
          isCurrent: path === "/profile",
          label: t("admin.action.profile"),
          variant: "secondary" as const,
        }
      : undefined,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));
  return (
    <ProductShell
      actions={actions}
      appName={t("admin.appName")}
      description={t("admin.description")}
      homeHref="/admin"
      eyebrow={t("admin.eyebrow")}
      status={t("admin.status")}
      statusTone="warning"
      title={t("admin.title")}
    >
      {children}
    </ProductShell>
  );
};
