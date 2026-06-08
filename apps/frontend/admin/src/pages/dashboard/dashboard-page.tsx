import { useQuery } from "@tanstack/react-query";
import {
  adminApi,
  throwOnOpenApiErrorData,
  type ApiClientRequestOptions,
} from "@app/api-client";
import {
  UiCard,
  UiLoading,
  UiResourceError,
  UiSection,
  UiStatCard,
  UiStatusTag,
  useI18n,
} from "@app/frontend-ui";
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
    <UiCard title={label}>
      <UiStatusTag label={stateLabel} tone={statusTone[state]} />
    </UiCard>
  );
};

const DashboardStaticPage = ({ access }: Readonly<{ access: AdminAccess }>) => {
  const { t } = useI18n();
  return (
    <UiSection
      eyebrow={t("admin.dashboard.eyebrow")}
      title={t("admin.dashboard.title")}
    >
      <UiCard title={t("admin.dashboard.card.visibility.title")}>
        {t("admin.dashboard.card.visibility.description")}
      </UiCard>
      <UiCard title={t("admin.dashboard.card.access.title")}>
        {t("admin.dashboard.accessSummary", {
          roles: access.roles.join(", ") || t("admin.dashboard.access.none"),
          permissions:
            access.permissions.join(", ") || t("admin.dashboard.access.none"),
        })}
      </UiCard>
    </UiSection>
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
      eyebrow={t("admin.dashboard.eyebrow")}
      title={t("admin.dashboard.title")}
    >
      <div className="xr-stat-grid">
        <UiStatCard
          label={t("admin.dashboard.summary.totalUsers")}
          value={`${summary.data?.totalUsers ?? "—"}`}
          detail={t("admin.dashboard.summary.totalUsersDetail")}
        />
        <UiStatCard
          label={t("admin.dashboard.summary.activeUsers")}
          value={`${summary.data?.activeUsers ?? "—"}`}
          detail={t("admin.dashboard.summary.activeUsersDetail")}
        />
        <UiStatCard
          label={t("admin.dashboard.summary.disabledUsers")}
          value={`${summary.data?.disabledUsers ?? "—"}`}
          detail={t("admin.dashboard.summary.disabledUsersDetail")}
        />
        <UiStatCard
          label={t("admin.dashboard.summary.recentAudit")}
          value={`${summary.data?.recentAuditEvents ?? "—"}`}
          detail={t("admin.dashboard.summary.recentAuditDetail")}
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
      <div className="xr-card-grid">
        <HealthCard label={t("admin.health.eyebrow")} query={health} />
        <HealthCard label={t("admin.health.live")} query={live} />
        <HealthCard label={t("admin.health.ready")} query={ready} />
      </div>
      <UiCard title={t("admin.dashboard.card.access.title")}>
        {t("admin.dashboard.accessSummary", {
          roles: access.roles.join(", ") || t("admin.dashboard.access.none"),
          permissions:
            access.permissions.join(", ") || t("admin.dashboard.access.none"),
        })}
      </UiCard>
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
