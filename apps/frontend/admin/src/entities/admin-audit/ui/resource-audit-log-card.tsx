import { useQuery } from '@tanstack/react-query';
import { adminApi, throwOnOpenApiErrorData, type ApiClientRequestOptions } from '@app/frontend-api-client';
import { useI18n } from '@app/frontend-runtime';
import { UiCard, UiDataTable } from '@app/frontend-ui-web';
import { errorText, formatDate } from '../../../shared';
import type { AuditRow } from '../model/types';

type AuditResource = NonNullable<adminApi.AdminAuditListQuery['resource']>;

export const ResourceAuditLogCard = ({
  requestOptions,
  resource,
  targetId,
}: Readonly<{
  requestOptions?: ApiClientRequestOptions;
  resource: AuditResource;
  targetId: string;
}>) => {
  const { t } = useI18n();
  const params = { limit: 10, offset: 0, resource, targetId } satisfies adminApi.AdminAuditListQuery;
  const audit = useQuery({
    queryKey: [...adminApi.getAuditLogAdminControllerListQueryKey(params), requestOptions] as const,
    queryFn: () => throwOnOpenApiErrorData(adminApi.auditLogAdminControllerList(params, requestOptions)),
    retry: false,
  });
  const fullHistoryHref = `/admin/audit?resource=${encodeURIComponent(resource)}&targetId=${encodeURIComponent(targetId)}`;

  return (
    <UiCard className="admin-resource-audit-card" title={t('admin.audit.resourceHistory.title')}>
      <UiDataTable<AuditRow>
        rows={audit.data?.items ?? []}
        rowKey={(row) => row.id}
        isLoading={audit.isLoading}
        loadingLabel={t('admin.audit.loading')}
        error={audit.error ? errorText(audit.error, 'admin.audit.error.requestFailed', t) : undefined}
        emptyTitle={t('admin.audit.resourceHistory.emptyTitle')}
        emptyDescription={t('admin.audit.resourceHistory.emptyDescription')}
        getRowAriaLabel={(row) => t('admin.audit.row.open', { action: row.action })}
        columns={[
          {
            id: 'action',
            header: t('admin.audit.column.action'),
            render: (row) => <a href={`/admin/audit/${row.id}`}>{row.action}</a>,
          },
          {
            id: 'actor',
            header: t('admin.audit.column.actor'),
            render: (row) => row.actorUserId ?? '—',
          },
          {
            id: 'created',
            header: t('admin.audit.column.created'),
            render: (row) => formatDate(row.createdAt),
          },
        ]}
      />
      <a className="admin-resource-history-link" href={fullHistoryHref}>
        {t('admin.audit.resourceHistory.viewAll')}
      </a>
    </UiCard>
  );
};
