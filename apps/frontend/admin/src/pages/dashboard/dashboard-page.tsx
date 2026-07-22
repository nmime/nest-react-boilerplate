import { useQuery } from '@tanstack/react-query';
import { adminApi, throwOnOpenApiErrorData, type ApiClientRequestOptions } from '@app/frontend-api-client';
import { useI18n } from '@app/frontend-runtime';
import { UiCard, UiResourceError, UiSection, UiStatCard, UiStatusTag } from '@app/frontend-ui-web';
import type { AdminAccess } from '../../entities/admin-session';
import { errorText, statusTone } from '../../shared';

const HealthCard = ({
  label,
  query,
}: Readonly<{
  label: string;
  query: { isLoading: boolean; error: unknown };
}>) => {
  const { t } = useI18n();
  let state: 'ready' | 'loading' | 'error' = 'ready';
  if (query.isLoading) {
    state = 'loading';
  } else if (query.error) {
    state = 'error';
  }
  const stateLabel = {
    error: t('admin.health.unavailable'),
    loading: t('admin.state.loading'),
    ready: t('admin.health.ready'),
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
    <UiCard className="admin-access-card" title={t('admin.dashboard.card.access.title')}>
      <p>
        {t('admin.dashboard.accessSummary', {
          roles: access.roles.join(', ') || t('admin.dashboard.access.none'),
          permissions: access.permissions.length ? `${access.permissions.length}` : t('admin.dashboard.access.none'),
        })}
      </p>
      <div className="admin-chip-row" aria-label={t('admin.users.column.roles')}>
        {(access.roles.length ? access.roles : [t('admin.dashboard.access.none')]).map((role) => (
          <span className="admin-chip" key={role}>
            {role}
          </span>
        ))}
      </div>
    </UiCard>
  );
};

const DashboardStaticPage = ({ access }: Readonly<{ access: AdminAccess }>) => {
  const { t } = useI18n();
  return (
    <UiSection
      className="admin-page admin-dashboard-page"
      eyebrow={t('admin.dashboard.eyebrow')}
      headingLevel={1}
      title={t('admin.dashboard.title')}
    >
      <div className="admin-dashboard-hero">
        <UiCard className="admin-dashboard-hero__card" title={t('admin.dashboard.card.visibility.title')}>
          {t('admin.dashboard.card.visibility.description')}
        </UiCard>
        <UiCard className="admin-dashboard-hero__card" title={t('admin.dashboard.card.rbac.title')}>
          {t('admin.dashboard.card.rbac.description')}
        </UiCard>
      </div>
      <AccessSummaryCard access={access} />
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
    queryKey: [...adminApi.getAdminUsersControllerDashboardSummaryQueryKey(), requestOptions] as const,
    queryFn: () => throwOnOpenApiErrorData(adminApi.adminUsersControllerDashboardSummary(requestOptions)),
    retry: false,
  });
  const health = useQuery({
    queryKey: ['admin-health', requestOptions] as const,
    queryFn: () =>
      adminApi.adminHealthControllerHealth(requestOptions).then((r) => {
        if (!r.response.ok) {
          throw new Error('health');
        }
        return true;
      }),
    retry: false,
  });
  const live = useQuery({
    queryKey: ['admin-live', requestOptions] as const,
    queryFn: () =>
      adminApi.adminHealthControllerLive(requestOptions).then((r) => {
        if (!r.response.ok) {
          throw new Error('live');
        }
        return true;
      }),
    retry: false,
  });
  const ready = useQuery({
    queryKey: ['admin-ready', requestOptions] as const,
    queryFn: () =>
      adminApi.adminHealthControllerReady(requestOptions).then((r) => {
        if (!r.response.ok) {
          throw new Error('ready');
        }
        return true;
      }),
    retry: false,
  });
  return (
    <UiSection
      className="admin-page admin-dashboard-page"
      eyebrow={t('admin.dashboard.eyebrow')}
      headingLevel={1}
      title={t('admin.dashboard.title')}
    >
      <div className="admin-stat-grid xr-stat-grid">
        <UiStatCard
          className="admin-stat-card"
          label={t('admin.dashboard.summary.totalUsers')}
          value={`${summary.data?.totalUsers ?? '—'}`}
          detail={t('admin.dashboard.summary.totalUsersDetail')}
        />
        <UiStatCard
          className="admin-stat-card"
          label={t('admin.dashboard.summary.activeUsers')}
          value={`${summary.data?.activeUsers ?? '—'}`}
          detail={t('admin.dashboard.summary.activeUsersDetail')}
        />
        <UiStatCard
          className="admin-stat-card"
          label={t('admin.dashboard.summary.disabledUsers')}
          value={`${summary.data?.disabledUsers ?? '—'}`}
          detail={t('admin.dashboard.summary.disabledUsersDetail')}
        />
        <UiStatCard
          className="admin-stat-card"
          label={t('admin.dashboard.summary.recentAudit')}
          value={`${summary.data?.recentAuditEvents ?? '—'}`}
          detail={t('admin.dashboard.summary.recentAuditDetail')}
        />
        <UiStatCard
          className="admin-stat-card"
          label={t('admin.dashboard.summary.invitedUsers')}
          value={`${summary.data?.invitedUsers ?? '—'}`}
          detail={t('admin.dashboard.summary.invitedUsersDetail')}
        />
      </div>
      {summary.error ? (
        <UiResourceError
          title={t('admin.dashboard.error.summaryRequestFailed')}
          description={errorText(summary.error, 'admin.dashboard.error.summaryRequestFailed', t)}
        />
      ) : null}
      <div className="admin-health-grid xr-card-grid">
        <HealthCard label={t('admin.health.eyebrow')} query={health} />
        <HealthCard label={t('admin.health.live')} query={live} />
        <HealthCard label={t('admin.health.ready')} query={ready} />
      </div>
      <AccessSummaryCard access={access} />
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
