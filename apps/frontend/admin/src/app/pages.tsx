import { type ReactNode } from "react";
import { UiLoading, UiSection } from "@app/frontend-ui";
import { AdminLayout } from "./admin-pages/admin-layout";
import { AuditPage } from "./admin-pages/audit-page";
import { DashboardPage } from "./admin-pages/dashboard-page";
import { ProfilePage, TenantRoadmapPage } from "./admin-pages/profile-pages";
import { ForbiddenPage, NotFoundPage } from "./admin-pages/state-pages";
import { RolesPage } from "./admin-pages/roles-page";
import { UsersPage } from "./admin-pages/users-page";
import type { AdminProfileState, AdminRouteRuntime } from "./admin-pages/types";
import {
  fallbackTranslate,
  normalizeAdminPath,
  type Translate,
} from "./admin-pages/utils";

export type { AdminProfileState, AdminRouteRuntime } from "./admin-pages/types";
export { AdminLayout } from "./admin-pages/admin-layout";
export { AuditPage } from "./admin-pages/audit-page";
export { DashboardPage } from "./admin-pages/dashboard-page";
export { ProfilePage, TenantRoadmapPage } from "./admin-pages/profile-pages";
export { ForbiddenPage, NotFoundPage } from "./admin-pages/state-pages";
export { RolesPage } from "./admin-pages/roles-page";
export { UsersPage } from "./admin-pages/users-page";
export { normalizeAdminPath } from "./admin-pages/utils";

/* eslint-disable sonarjs/cognitive-complexity -- route matrix is explicit for RBAC auditability. */
const renderReadyAdminRoute = (
  path: string,
  state: Extract<AdminProfileState, { status: "ready" }>,
  t: Translate,
  runtime: AdminRouteRuntime,
): ReactNode => {
  const routePath = normalizeAdminPath(path);
  if (routePath === "/" || routePath === "/dashboard") {
    return state.access.canReadDashboard ? (
      <DashboardPage
        access={state.access}
        requestOptions={runtime.requestOptions}
      />
    ) : (
      <ForbiddenPage reason={t("admin.permission.dashboardMissing")} />
    );
  }
  if (routePath.startsWith("/users")) {
    return state.access.canReadUsers ? (
      <UsersPage
        access={state.access}
        currentPath={path}
        requestOptions={runtime.requestOptions}
      />
    ) : (
      <ForbiddenPage reason={t("admin.permission.usersMissing")} />
    );
  }
  if (routePath === "/roles") {
    return state.access.canReadRoles ? (
      <RolesPage requestOptions={runtime.requestOptions} />
    ) : (
      <ForbiddenPage reason={t("admin.permission.rolesMissing")} />
    );
  }
  if (routePath === "/audit") {
    return state.access.canReadAudit ? (
      <AuditPage requestOptions={runtime.requestOptions} />
    ) : (
      <ForbiddenPage reason={t("admin.permission.auditMissing")} />
    );
  }
  if (routePath === "/profile") {
    return state.access.canReadProfile ? (
      <ProfilePage payload={state.payload} />
    ) : (
      <ForbiddenPage reason={t("admin.permission.profileMissing")} />
    );
  }
  return routePath === "/tenants" ? <TenantRoadmapPage /> : <NotFoundPage />;
};
/* eslint-enable sonarjs/cognitive-complexity */

export const renderAdminRoute = (
  path: string,
  state: AdminProfileState,
  t: Translate = fallbackTranslate,
  runtime: AdminRouteRuntime = {},
): ReactNode => {
  if (state.status === "loading") {
    return (
      <UiSection
        eyebrow={t("admin.loadingEyebrow")}
        title={t("admin.loadingProfile")}
      >
        <UiLoading label={t("admin.loadingProfile")} />
      </UiSection>
    );
  }
  if (state.status === "forbidden") {
    return <ForbiddenPage reason={state.reason} />;
  }
  const rendered = renderReadyAdminRoute(path, state, t, runtime);
  return rendered;
};
