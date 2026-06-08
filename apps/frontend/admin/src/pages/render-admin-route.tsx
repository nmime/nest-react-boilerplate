import { type ReactElement } from "react";
import type { ApiClientRequestOptions } from "@app/api-client";
import { UiLoading, UiSection } from "@app/frontend-ui";
import type { AdminProfileState } from "../entities/admin-profile";
import { AuditPage } from "./audit";
import { DashboardPage } from "./dashboard";
import { ForbiddenPage } from "./forbidden";
import { NotFoundPage } from "./not-found";
import { ProfilePage } from "./profile";
import { RolesPage } from "./roles";
import { TenantRoadmapPage } from "./tenants";
import { UsersPage } from "./users";
import {
  fallbackTranslate,
  normalizeAdminPath,
  type Translate,
} from "../shared";

export interface AdminRouteRuntime {
  requestOptions?: ApiClientRequestOptions;
}

/* eslint-disable sonarjs/cognitive-complexity -- route matrix is explicit for RBAC auditability. */
function renderReadyAdminRoute(
  path: string,
  state: Extract<AdminProfileState, { status: "ready" }>,
  t: Translate,
  runtime: AdminRouteRuntime,
): ReactElement {
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
}
/* eslint-enable sonarjs/cognitive-complexity */

export function renderAdminRoute(
  path: string,
  state: AdminProfileState,
  t: Translate = fallbackTranslate,
  runtime: AdminRouteRuntime = {},
): ReactElement {
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
}
