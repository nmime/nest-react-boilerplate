import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi, throwOnOpenApiErrorData, type ApiClientRequestOptions } from '@app/frontend-api-client';
import { useI18n } from '@app/frontend-runtime';
import {
  UiButton,
  UiCard,
  UiDataTable,
  UiInput,
  UiPagination,
  UiSection,
  UiSelect,
  UiStatCard,
} from '@app/frontend-ui-web';
import { adminPaginationLabels, errorText, formatDate, pageSize, paramsFromPath, totalPages } from '../../shared';

type LoginEvent = adminApi.AuthLoginAnalyticsEventDto;

interface LoginFilters {
  outcome: string;
  provider: string;
  countryCode: string;
  language: string;
  timezone: string;
  userId: string;
  occurredFrom: string;
  occurredTo: string;
}

const emptyFilters: LoginFilters = {
  outcome: 'all',
  provider: '',
  countryCode: '',
  language: '',
  timezone: '',
  userId: '',
  occurredFrom: '',
  occurredTo: '',
};

const filtersFromPath = (path: string): LoginFilters => {
  const params = paramsFromPath(path);
  return {
    ...emptyFilters,
    outcome: params.get('outcome') ?? emptyFilters.outcome,
    provider: params.get('provider') ?? '',
    countryCode: params.get('countryCode') ?? '',
    language: params.get('language') ?? '',
    timezone: params.get('timezone') ?? '',
    userId: params.get('userId') ?? '',
    occurredFrom: params.get('occurredFrom') ?? '',
    occurredTo: params.get('occurredTo') ?? '',
  };
};

const isoDate = (value: string): string | undefined => {
  if (!value) {
    return undefined;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
};

const dimensionsText = (items: Array<{ key: string; count: number }>): string =>
  items.length === 0
    ? '—'
    : items
        .slice(0, 5)
        .map((item) => `${item.key} · ${item.count}`)
        .join('  /  ');

export const AuthLoginAnalyticsPage = ({
  currentPath = '/auth/login-analytics',
  requestOptions,
}: Readonly<{ currentPath?: string; requestOptions?: ApiClientRequestOptions }>) => {
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<LoginFilters>(() => filtersFromPath(currentPath));
  const [filters, setFilters] = useState<LoginFilters>(() => filtersFromPath(currentPath));
  const [selected, setSelected] = useState<LoginEvent>();
  const queryFilters = useMemo<adminApi.AdminAuthLoginAnalyticsQuery>(
    () => ({
      ...(filters.outcome === 'success' || filters.outcome === 'failure' ? { outcome: filters.outcome } : {}),
      ...(filters.provider ? { provider: filters.provider.trim() } : {}),
      ...(filters.countryCode ? { countryCode: filters.countryCode.trim().toUpperCase() } : {}),
      ...(filters.language ? { language: filters.language.trim().toLowerCase() } : {}),
      ...(filters.timezone ? { timezone: filters.timezone.trim() } : {}),
      ...(filters.userId ? { userId: filters.userId.trim() } : {}),
      ...(isoDate(filters.occurredFrom) ? { occurredFrom: isoDate(filters.occurredFrom) } : {}),
      ...(isoDate(filters.occurredTo) ? { occurredTo: isoDate(filters.occurredTo) } : {}),
    }),
    [filters],
  );
  const params = useMemo<adminApi.AdminAuthLoginAnalyticsQuery>(
    () => ({ ...queryFilters, limit: pageSize, offset: (page - 1) * pageSize }),
    [page, queryFilters],
  );
  const events = useQuery({
    queryKey: [...adminApi.getAuthLoginAnalyticsAdminControllerListQueryKey(params), requestOptions] as const,
    queryFn: () => throwOnOpenApiErrorData(adminApi.authLoginAnalyticsAdminControllerList(params, requestOptions)),
    retry: false,
  });
  const summary = useQuery({
    queryKey: [...adminApi.getAuthLoginAnalyticsAdminControllerSummaryQueryKey(queryFilters), requestOptions] as const,
    queryFn: () =>
      throwOnOpenApiErrorData(adminApi.authLoginAnalyticsAdminControllerSummary(queryFilters, requestOptions)),
    retry: false,
  });
  const updateDraft = (key: keyof LoginFilters, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  return (
    <UiSection
      className="admin-page admin-login-analytics-page"
      eyebrow={t('admin.loginAnalytics.eyebrow')}
      headingLevel={1}
      title={t('admin.loginAnalytics.title')}
    >
      <p>{t('admin.loginAnalytics.description')}</p>
      <div className="admin-stat-grid xr-stat-grid">
        <UiStatCard
          className="admin-stat-card"
          label={t('admin.loginAnalytics.metric.total')}
          value={`${summary.data?.total ?? '—'}`}
          detail={t('admin.loginAnalytics.metric.totalDetail')}
        />
        <UiStatCard
          className="admin-stat-card"
          label={t('admin.loginAnalytics.metric.successRate')}
          value={summary.data ? `${summary.data.successRate}%` : '—'}
          detail={`${summary.data?.successful ?? 0} / ${summary.data?.failed ?? 0}`}
        />
        <UiStatCard
          className="admin-stat-card"
          label={t('admin.loginAnalytics.metric.uniqueUsers')}
          value={`${summary.data?.uniqueUsers ?? '—'}`}
          detail={t('admin.loginAnalytics.metric.uniqueUsersDetail')}
        />
      </div>
      <UiCard className="admin-filter-card" title={t('admin.loginAnalytics.filter.title')}>
        <div className="admin-login-filters">
          <UiSelect
            label={t('admin.loginAnalytics.filter.outcome')}
            value={draft.outcome}
            onValueChange={(value) => {
              updateDraft('outcome', value);
            }}
            options={[
              { label: t('admin.loginAnalytics.filter.all'), value: 'all' },
              { label: t('admin.loginAnalytics.outcome.success'), value: 'success' },
              { label: t('admin.loginAnalytics.outcome.failure'), value: 'failure' },
            ]}
          />
          {(['provider', 'countryCode', 'language', 'timezone', 'userId'] as const).map((field) => (
            <label className="admin-audit-filter-input" key={field}>
              <span>{t(`admin.loginAnalytics.filter.${field}`)}</span>
              <UiInput
                aria-label={t(`admin.loginAnalytics.filter.${field}`)}
                value={draft[field]}
                onChange={(event) => {
                  updateDraft(field, event.currentTarget.value);
                }}
              />
            </label>
          ))}
          <label className="admin-audit-filter-input">
            <span>{t('admin.loginAnalytics.filter.from')}</span>
            <UiInput
              type="datetime-local"
              value={draft.occurredFrom}
              onChange={(event) => {
                updateDraft('occurredFrom', event.currentTarget.value);
              }}
            />
          </label>
          <label className="admin-audit-filter-input">
            <span>{t('admin.loginAnalytics.filter.to')}</span>
            <UiInput
              type="datetime-local"
              value={draft.occurredTo}
              onChange={(event) => {
                updateDraft('occurredTo', event.currentTarget.value);
              }}
            />
          </label>
          <div className="admin-audit-filter-actions">
            <UiButton
              onClick={() => {
                setFilters(draft);
                setPage(1);
              }}
            >
              {t('admin.loginAnalytics.filter.apply')}
            </UiButton>
            <UiButton
              variant="secondary"
              onClick={() => {
                setDraft(emptyFilters);
                setFilters(emptyFilters);
                setPage(1);
              }}
            >
              {t('admin.loginAnalytics.filter.clear')}
            </UiButton>
          </div>
        </div>
      </UiCard>
      {summary.error ? <p>{errorText(summary.error, 'admin.loginAnalytics.error', t)}</p> : null}
      <div className="admin-login-dimensions">
        <UiCard title={t('admin.loginAnalytics.dimension.country')}>
          <p>{dimensionsText(summary.data?.byCountry ?? [])}</p>
        </UiCard>
        <UiCard title={t('admin.loginAnalytics.dimension.language')}>
          <p>{dimensionsText(summary.data?.byLanguage ?? [])}</p>
        </UiCard>
        <UiCard title={t('admin.loginAnalytics.dimension.timezone')}>
          <p>{dimensionsText(summary.data?.byTimezone ?? [])}</p>
        </UiCard>
        <UiCard title={t('admin.loginAnalytics.dimension.provider')}>
          <p>{dimensionsText(summary.data?.byProvider ?? [])}</p>
        </UiCard>
      </div>
      <div className="admin-audit-split">
        <div>
          <UiCard className="admin-table-card" title={t('admin.loginAnalytics.events.title')}>
            <UiDataTable<LoginEvent>
              rows={events.data?.items ?? []}
              rowKey={(row) => row.id}
              isLoading={events.isLoading}
              loadingLabel={t('admin.loginAnalytics.loading')}
              error={events.error ? errorText(events.error, 'admin.loginAnalytics.error', t) : undefined}
              emptyTitle={t('admin.loginAnalytics.empty.title')}
              emptyDescription={t('admin.loginAnalytics.empty.description')}
              onRowClick={setSelected}
              getRowAriaLabel={(row) => `${row.provider} ${row.outcome}`}
              columns={[
                {
                  id: 'outcome',
                  header: t('admin.loginAnalytics.column.outcome'),
                  render: (row) => <span className="admin-chip">{row.outcome}</span>,
                },
                {
                  id: 'provider',
                  header: t('admin.loginAnalytics.column.provider'),
                  render: (row) => `${row.provider} / ${row.channel}`,
                },
                { id: 'user', header: t('admin.loginAnalytics.column.user'), render: (row) => row.userId ?? '—' },
                {
                  id: 'geo',
                  header: t('admin.loginAnalytics.column.geo'),
                  render: (row) => [row.countryCode, row.region, row.city].filter(Boolean).join(' · ') || '—',
                },
                {
                  id: 'locale',
                  header: t('admin.loginAnalytics.column.locale'),
                  render: (row) => `${row.language ?? '—'} / ${row.timezone ?? '—'}`,
                },
                {
                  id: 'occurred',
                  header: t('admin.loginAnalytics.column.occurred'),
                  render: (row) => formatDate(row.occurredAt),
                },
              ]}
            />
          </UiCard>
          <UiPagination
            {...adminPaginationLabels(t, page, events.data?.limit ?? pageSize, events.data?.total ?? 0)}
            currentPage={page}
            pageSize={events.data?.limit ?? pageSize}
            totalItems={events.data?.total ?? 0}
            totalPages={totalPages(events.data?.total, events.data?.limit)}
            onPageChange={setPage}
          />
        </div>
        <UiCard className="admin-detail-panel" title={t('admin.loginAnalytics.detail.title')}>
          {!selected ? (
            <p>{t('admin.loginAnalytics.detail.select')}</p>
          ) : (
            <dl className="admin-login-detail">
              <div>
                <dt>{t('admin.loginAnalytics.column.outcome')}</dt>
                <dd>
                  {selected.outcome}
                  {selected.failureCode ? ` · ${selected.failureCode}` : ''}
                </dd>
              </div>
              <div>
                <dt>{t('admin.loginAnalytics.column.user')}</dt>
                <dd>{selected.userId ?? '—'}</dd>
              </div>
              <div>
                <dt>{t('admin.loginAnalytics.detail.ip')}</dt>
                <dd>{selected.ipAddress ?? t('admin.loginAnalytics.detail.anonymized')}</dd>
              </div>
              <div>
                <dt>{t('admin.loginAnalytics.column.geo')}</dt>
                <dd>{[selected.countryCode, selected.region, selected.city].filter(Boolean).join(' · ') || '—'}</dd>
              </div>
              <div>
                <dt>{t('admin.loginAnalytics.detail.userAgent')}</dt>
                <dd>{selected.userAgent ?? '—'}</dd>
              </div>
              <div>
                <dt>{t('admin.loginAnalytics.detail.request')}</dt>
                <dd>{selected.requestId ?? '—'}</dd>
              </div>
              <div>
                <dt>{t('admin.loginAnalytics.column.occurred')}</dt>
                <dd>{formatDate(selected.occurredAt)}</dd>
              </div>
            </dl>
          )}
        </UiCard>
      </div>
    </UiSection>
  );
};
