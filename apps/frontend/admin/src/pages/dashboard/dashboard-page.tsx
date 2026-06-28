import { useQuery } from "@tanstack/react-query";
import {
  adminApi,
  throwOnOpenApiErrorData,
  type ApiClientRequestOptions,
} from "@app/frontend/api-client";
import {
  UiCard,
  UiLoading,
  UiResourceError,
  UiSection,
  UiStatCard,
  UiStatusTag,
  useI18n,
} from "@app/frontend/ui";
import type { AdminAccess } from "../../entities/admin-session";
import { errorText, statusTone } from "../../shared";

const HealthCard = ({
  label,
  query,
}: Readonly<{
  label: string;
  query: { isLoading: boolean; error: unknown };
}>) => {
  const { t } = useI18n();
  let state: "ready" | "loading" | "error" = "ready";
  if (query.isLoading) {
    state = "loading";
  } else if (query.error) {
    state = "error";
  }
  const stateLabel = {
    error: t("admin.health.unavailable"),
    loading: t("admin.state.loading"),
    ready: t("admin.health.ready"),
  }[state];
  return (
    <UiCard className="admin-health-card" title={label}>
      <UiStatusTag label={stateLabel} tone={statusTone[state]} />
    </UiCard>
  );
};

const AccessSummaryCard = ({ access }: Readonly<{ access: AdminAccess }>) => {
  const { t } = useI18n();
  return (
    <UiCard
      className="admin-access-card"
      title={t("admin.dashboard.card.access.title")}
    >
      <p>
        {t("admin.dashboard.accessSummary", {
          roles: access.roles.join(", ") || t("admin.dashboard.access.none"),
          permissions:
            access.permissions.join(", ") || t("admin.dashboard.access.none"),
        })}
      </p>
      <div
        className="admin-chip-row"
        aria-label={t("admin.users.column.roles")}
      >
        {(access.roles.length
          ? access.roles
          : [t("admin.dashboard.access.none")]
        ).map((role) => (
          <span className="admin-chip" key={role}>
            {role}
          </span>
        ))}
      </div>
    </UiCard>
  );
};

const DashboardCommandCenter = ({
  access,
  invitedUsers,
  totalUsers,
}: Readonly<{
  access: AdminAccess;
  invitedUsers?: number;
  totalUsers?: number;
}>) => {
  const protectedRoutes = [
    access.canReadDashboard,
    access.canReadUsers,
    access.canReadRoles,
    access.canReadAudit,
    access.canReadProfile,
    access.canReadRoles,
  ];
  const readyRoutes = protectedRoutes.filter(Boolean).length;
  return (
    <UiCard className="admin-command-center" title="Operations command center">
      <div className="admin-command-center__hero">
        <div>
          <p className="xr-eyebrow">Design v3 console</p>
          <strong>
            Admin workspace tuned for triage, access review, and safe action.
          </strong>
          <span>
            Live widgets degrade to explicit loading, empty, and error states
            while RBAC keeps restricted routes out of reach.
          </span>
        </div>
        <div
          className="admin-command-center__score"
          aria-label="Route readiness"
        >
          <span>{readyRoutes}/6</span>
          <small>routes ready</small>
        </div>
      </div>
      <div className="admin-signal-grid">
        <div className="admin-signal-card">
          <span>Directory coverage</span>
          <strong>{totalUsers ?? "—"}</strong>
          <small>Total users currently visible to the admin API.</small>
        </div>
        <div className="admin-signal-card">
          <span>Pending invites</span>
          <strong>{invitedUsers ?? "—"}</strong>
          <small>
            Invitation queue is called out before it becomes an access risk.
          </small>
        </div>
        <div className="admin-signal-card">
          <span>Guardrail</span>
          <strong>{access.canAccessAdmin ? "closed" : "blocked"}</strong>
          <small>
            Every page still renders from explicit frontend permissions.
          </small>
        </div>
      </div>
    </UiCard>
  );
};

const DashboardStaticPage = ({ access }: Readonly<{ access: AdminAccess }>) => {
  const { t } = useI18n();
  return (
    <UiSection
      className="admin-page admin-dashboard-page"
      eyebrow={t("admin.dashboard.eyebrow")}
      title={t("admin.dashboard.title")}
    >
      <div className="admin-dashboard-hero">
        <UiCard
          className="admin-dashboard-hero__card"
          title={t("admin.dashboard.card.visibility.title")}
        >
          {t("admin.dashboard.card.visibility.description")}
        </UiCard>
        <UiCard
          className="admin-dashboard-hero__card"
          title={t("admin.dashboard.card.rbac.title")}
        >
          {t("admin.dashboard.card.rbac.description")}
        </UiCard>
      </div>
      <DashboardCommandCenter access={access} />
      <AccessSummaryCard access={access} />
      <AdminRouteReadiness access={access} />
    </UiSection>
  );
};

const AdminRouteReadiness = ({ access }: Readonly<{ access: AdminAccess }>) => {
  const { t } = useI18n();
  const routes = [
    {
      detail: t("admin.dashboard.card.rbac.description"),
      isReady: access.canReadDashboard,
      label: t("admin.action.dashboard"),
      path: "/admin",
    },
    {
      detail: t("admin.dashboard.card.visibility.description"),
      isReady: access.canReadUsers,
      label: t("admin.action.users"),
      path: "/admin/users",
    },
    {
      detail: t("admin.roles.title"),
      isReady: access.canReadRoles,
      label: t("admin.action.roles"),
      path: "/admin/roles",
    },
    {
      detail: t("admin.dashboard.summary.recentAuditDetail"),
      isReady: access.canReadAudit,
      label: t("admin.action.audit"),
      path: "/admin/audit",
    },
    {
      detail: t("admin.dashboard.stat.profile.detail"),
      isReady: access.canReadProfile,
      label: t("admin.action.profile"),
      path: "/admin/profile",
    },
    {
      detail: t("admin.tenants.description"),
      isReady: access.canReadRoles,
      label: t("admin.tenants.title"),
      path: "/admin/tenants",
    },
  ];

  return (
    <UiCard
      className="admin-route-card"
      title={t("admin.dashboard.stat.pages.label")}
    >
      <div className="admin-readiness-grid">
        {routes.map((route) => (
          <div
            className="admin-readiness-card"
            data-ready={route.isReady}
            key={route.path}
          >
            <div className="admin-readiness-card__header">
              <strong>{route.label}</strong>
              <UiStatusTag
                label={
                  route.isReady
                    ? t("admin.health.ready")
                    : t("admin.health.unavailable")
                }
                tone={route.isReady ? "success" : "warning"}
              />
            </div>
            <code>{route.path}</code>
            <p>{route.detail}</p>
          </div>
        ))}
      </div>
    </UiCard>
  );
};

const DashboardDataPage = ({
  access,
  requestOptions,
}: Readonly<{
  access: AdminAccess;
  requestOptions: ApiClientRequestOptions;
}>) => {
  const { t } = useI18n();
  const summary = useQuery({
    queryKey: [
      ...adminApi.getAdminUsersControllerDashboardSummaryQueryKey(),
      requestOptions,
    ] as const,
    queryFn: () =>
      throwOnOpenApiErrorData(
        adminApi.adminUsersControllerDashboardSummary(requestOptions),
      ),
    retry: false,
  });
  const health = useQuery({
    queryKey: ["admin-health", requestOptions] as const,
    queryFn: () =>
      adminApi.adminHealthControllerHealth(requestOptions).then((r) => {
        if (r.error || !r.response.ok) throw new Error("health");
        return true;
      }),
    retry: false,
  });
  const live = useQuery({
    queryKey: ["admin-live", requestOptions] as const,
    queryFn: () =>
      adminApi.adminHealthControllerLive(requestOptions).then((r) => {
        if (r.error || !r.response.ok) throw new Error("live");
        return true;
      }),
    retry: false,
  });
  const ready = useQuery({
    queryKey: ["admin-ready", requestOptions] as const,
    queryFn: () =>
      adminApi.adminHealthControllerReady(requestOptions).then((r) => {
        if (r.error || !r.response.ok) throw new Error("ready");
        return true;
      }),
    retry: false,
  });
  return (
    <UiSection
      className="admin-page admin-dashboard-page"
      eyebrow={t("admin.dashboard.eyebrow")}
      title={t("admin.dashboard.title")}
    >
      <div className="admin-stat-grid xr-stat-grid">
        <UiStatCard
          className="admin-stat-card"
          label={t("admin.dashboard.summary.totalUsers")}
          value={`${summary.data?.totalUsers ?? "—"}`}
          detail={t("admin.dashboard.summary.totalUsersDetail")}
        />
        <UiStatCard
          className="admin-stat-card"
          label={t("admin.dashboard.summary.activeUsers")}
          value={`${summary.data?.activeUsers ?? "—"}`}
          detail={t("admin.dashboard.summary.activeUsersDetail")}
        />
        <UiStatCard
          className="admin-stat-card"
          label={t("admin.dashboard.summary.disabledUsers")}
          value={`${summary.data?.disabledUsers ?? "—"}`}
          detail={t("admin.dashboard.summary.disabledUsersDetail")}
        />
        <UiStatCard
          className="admin-stat-card"
          label={t("admin.dashboard.summary.recentAudit")}
          value={`${summary.data?.recentAuditEvents ?? "—"}`}
          detail={t("admin.dashboard.summary.recentAuditDetail")}
        />
        <UiStatCard
          className="admin-stat-card"
          label="Pending invitations"
          value={`${summary.data?.invitedUsers ?? "—"}`}
          detail="Invite queue surfaced in the v3 admin console."
        />
      </div>
      {summary.isLoading ? (
        <UiLoading label={t("admin.dashboard.loadingSummary")} />
      ) : null}
      {summary.error ? (
        <UiResourceError
          title={t("admin.dashboard.error.summaryRequestFailed")}
          description={errorText(
            summary.error,
            "admin.dashboard.error.summaryRequestFailed",
            t,
          )}
        />
      ) : null}
      <div className="admin-health-grid xr-card-grid">
        <HealthCard label={t("admin.health.eyebrow")} query={health} />
        <HealthCard label={t("admin.health.live")} query={live} />
        <HealthCard label={t("admin.health.ready")} query={ready} />
      </div>
      <DashboardCommandCenter
        access={access}
        invitedUsers={summary.data?.invitedUsers}
        totalUsers={summary.data?.totalUsers}
      />
      <AccessSummaryCard access={access} />
      <AdminRouteReadiness access={access} />
    </UiSection>
  );
};

export const DashboardPage = ({
  access,
  requestOptions,
}: Readonly<{
  access: AdminAccess;
  requestOptions?: ApiClientRequestOptions;
}>) =>
  requestOptions ? (
    <DashboardDataPage access={access} requestOptions={requestOptions} />
  ) : (
    <DashboardStaticPage access={access} />
  );
