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
import type { AuditRow } from '../../entities/admin-audit';
import { errorText, formatDate, pageSize, totalPages } from '../../shared';

type AuditAction = NonNullable<adminApi.AdminAuditListQuery['action']>;
type AuditResource = NonNullable<adminApi.AdminAuditListQuery['resource']>;

const auditEntryIdFromPath = (path: string): string | undefined => {
  const match = /(?:^|\/)audit\/([0-9a-f-]{36})(?:$|[?#])/iu.exec(path);
  return match?.[1];
};

const isUuid = (value: string): boolean =>
  !value || /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);

const isAuditAction = (value: string, available: readonly string[]): value is AuditAction => available.includes(value);

const isAuditResource = (value: string, available: readonly string[]): value is AuditResource =>
  available.includes(value);

const JsonSnapshot = ({ title, value }: Readonly<{ title: string; value: Record<string, unknown> }>) => (
  <section className="admin-audit-json">
    <h3>{title}</h3>
    <pre>{JSON.stringify(value, null, 2)}</pre>
  </section>
);

export const AuditPage = ({
  currentPath = '/audit',
  requestOptions,
}: Readonly<{ currentPath?: string; requestOptions?: ApiClientRequestOptions }>) => {
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('all');
  const [resource, setResource] = useState('all');
  const [actorInput, setActorInput] = useState('');
  const [targetInput, setTargetInput] = useState('');
  const [actorUserId, setActorUserId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [selected, setSelected] = useState(() => auditEntryIdFromPath(currentPath));
  const metadata = useQuery({
    queryKey: [...adminApi.getAuditLogAdminControllerMetadataQueryKey(), requestOptions] as const,
    queryFn: () => throwOnOpenApiErrorData(adminApi.auditLogAdminControllerMetadata(requestOptions)),
    retry: false,
    staleTime: 60_000,
  });
  const availableActions = metadata.data?.actions ?? [];
  const availableResources = metadata.data?.resources ?? [];
  const params = useMemo<adminApi.AdminAuditListQuery>(
    () => ({
      limit: pageSize,
      offset: (page - 1) * pageSize,
      ...(isAuditAction(action, availableActions) ? { action } : {}),
      ...(isAuditResource(resource, availableResources) ? { resource } : {}),
      ...(actorUserId ? { actorUserId } : {}),
      ...(targetId ? { targetId } : {}),
    }),
    [action, actorUserId, availableActions, availableResources, page, resource, targetId],
  );
  const audit = useQuery({
    queryKey: [...adminApi.getAuditLogAdminControllerListQueryKey(params), requestOptions] as const,
    queryFn: () => throwOnOpenApiErrorData(adminApi.auditLogAdminControllerList(params, requestOptions)),
    retry: false,
  });
  const detail = useQuery({
    enabled: Boolean(selected),
    queryKey: [...adminApi.getAuditLogAdminControllerGetQueryKey(selected ?? ''), requestOptions] as const,
    queryFn: () =>
      throwOnOpenApiErrorData(
        /* v8 ignore next -- enabled only when an audit entry is selected. */
        adminApi.auditLogAdminControllerGet(selected ?? '', requestOptions),
      ),
    retry: false,
  });
  const rows = audit.data?.items ?? [];
  const filtersValid = isUuid(actorInput.trim()) && isUuid(targetInput.trim());

  return (
    <UiSection
      className="admin-page admin-audit-page"
      eyebrow={t('admin.audit.eyebrow')}
      title={t('admin.audit.title')}
    >
      <div className="admin-stat-grid xr-stat-grid">
        <UiStatCard
          className="admin-stat-card"
          label={t('admin.dashboard.summary.recentAudit')}
          value={`${audit.data?.total ?? '—'}`}
          detail={t('admin.dashboard.summary.recentAuditDetail')}
        />
      </div>
      <UiCard className="admin-filter-card" title={t('admin.audit.filter.title')}>
        <div className="admin-audit-filters">
          <UiSelect
            label={t('admin.audit.filter.action')}
            value={action}
            onValueChange={(value) => {
              setAction(value);
              setPage(1);
            }}
            options={[
              { label: t('admin.audit.filter.allActions'), value: 'all' },
              ...availableActions.map((value) => ({ label: value, value })),
            ]}
          />
          <UiSelect
            label={t('admin.audit.filter.resource')}
            value={resource}
            onValueChange={(value) => {
              setResource(value);
              setPage(1);
            }}
            options={[
              { label: t('admin.audit.filter.allResources'), value: 'all' },
              ...availableResources.map((value) => ({ label: value, value })),
            ]}
          />
          <label className="admin-audit-filter-input">
            <span>{t('admin.audit.filter.actor')}</span>
            <UiInput
              aria-label={t('admin.audit.filter.actor')}
              placeholder={t('admin.audit.filter.uuidPlaceholder')}
              value={actorInput}
              onChange={(event) => {
                setActorInput(event.currentTarget.value);
              }}
            />
          </label>
          <label className="admin-audit-filter-input">
            <span>{t('admin.audit.filter.target')}</span>
            <UiInput
              aria-label={t('admin.audit.filter.target')}
              placeholder={t('admin.audit.filter.uuidPlaceholder')}
              value={targetInput}
              onChange={(event) => {
                setTargetInput(event.currentTarget.value);
              }}
            />
          </label>
          <div className="admin-audit-filter-actions">
            <UiButton
              disabled={!filtersValid}
              onClick={() => {
                setActorUserId(actorInput.trim());
                setTargetId(targetInput.trim());
                setPage(1);
              }}
            >
              {t('admin.audit.filter.apply')}
            </UiButton>
            <UiButton
              variant="secondary"
              onClick={() => {
                setAction('all');
                setResource('all');
                setActorInput('');
                setTargetInput('');
                setActorUserId('');
                setTargetId('');
                setPage(1);
              }}
            >
              {t('admin.audit.filter.clear')}
            </UiButton>
          </div>
        </div>
      </UiCard>
      <div className="admin-audit-split">
        <div>
          <UiCard className="admin-table-card" title={t('admin.audit.title')}>
            <UiDataTable<AuditRow>
              rows={rows}
              rowKey={(row) => row.id}
              isLoading={audit.isLoading}
              loadingLabel={t('admin.audit.loading')}
              error={audit.error ? errorText(audit.error, 'admin.audit.error.requestFailed', t) : undefined}
              emptyTitle={t('admin.audit.emptyEyebrow')}
              emptyDescription={t('admin.audit.emptyTitle')}
              onRowClick={(row) => {
                setSelected(row.id);
              }}
              getRowAriaLabel={(row) => t('admin.audit.row.open', { action: row.action })}
              columns={[
                {
                  id: 'action',
                  header: t('admin.audit.column.action'),
                  render: (row) => (
                    <span className="admin-audit-action">
                      <strong>{row.action}</strong>
                      <small>{row.id}</small>
                    </span>
                  ),
                },
                {
                  id: 'resource',
                  header: t('admin.audit.column.resource'),
                  render: (row) => <span className="admin-chip">{row.resource}</span>,
                },
                {
                  id: 'actor',
                  header: t('admin.audit.column.actor'),
                  render: (row) => row.actorUserId ?? '—',
                },
                {
                  id: 'target',
                  header: t('admin.audit.column.target'),
                  render: (row) => row.targetId ?? '—',
                },
                {
                  id: 'created',
                  header: t('admin.audit.column.created'),
                  render: (row) => formatDate(row.createdAt),
                },
              ]}
            />
          </UiCard>
          <UiPagination
            currentPage={page}
            pageSize={audit.data?.limit ?? pageSize}
            totalItems={audit.data?.total ?? 0}
            totalPages={totalPages(audit.data?.total, audit.data?.limit)}
            onPageChange={setPage}
          />
        </div>
        <UiCard className="admin-detail-panel admin-audit-detail" title={t('admin.audit.detail.title')}>
          {detail.isLoading ? <p>{t('admin.audit.detail.loading')}</p> : null}
          {detail.error ? <p>{errorText(detail.error, 'admin.audit.detail.error', t)}</p> : null}
          {!selected ? <p>{t('admin.audit.detail.select')}</p> : null}
          {detail.data ? (
            <div className="admin-audit-detail__content">
              <dl>
                <div>
                  <dt>{t('admin.audit.column.action')}</dt>
                  <dd>{detail.data.action}</dd>
                </div>
                <div>
                  <dt>{t('admin.audit.column.resource')}</dt>
                  <dd>{detail.data.resource}</dd>
                </div>
                <div>
                  <dt>{t('admin.audit.column.actor')}</dt>
                  <dd>{detail.data.actorUserId ?? '—'}</dd>
                </div>
                <div>
                  <dt>{t('admin.audit.column.target')}</dt>
                  <dd>{detail.data.targetId ?? '—'}</dd>
                </div>
                <div>
                  <dt>{t('admin.audit.column.created')}</dt>
                  <dd>{formatDate(detail.data.createdAt)}</dd>
                </div>
              </dl>
              <JsonSnapshot title={t('admin.audit.detail.before')} value={detail.data.before} />
              <JsonSnapshot title={t('admin.audit.detail.after')} value={detail.data.after} />
              <JsonSnapshot title={t('admin.audit.detail.metadata')} value={detail.data.metadata} />
            </div>
          ) : null}
        </UiCard>
      </div>
    </UiSection>
  );
};
