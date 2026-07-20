import type { adminApi } from '@app/frontend-api-client';
import type { TranslationKey, TranslationParams } from '@app/frontend-runtime';
import { UiAvatar, UiEmptyState, UiLoading, UiResourceError, UiStatusTag } from '@app/frontend-ui-web';
import { errorText, join, statusLabelKey, statusTone } from '../../../shared';

export const UserDetailCard = ({
  detail,
  t,
}: Readonly<{
  detail: {
    data?: adminApi.AdminUsersControllerGetUserData;
    error: unknown;
    isLoading: boolean;
  };
  t: (key: TranslationKey, params?: TranslationParams) => string;
}>) => {
  if (detail.isLoading) {
    return <UiLoading label={t('admin.users.detail.loading')} />;
  }
  if (detail.error) {
    return (
      <UiResourceError
        title={t('admin.users.error.detailRequestFailed')}
        description={errorText(detail.error, 'admin.users.error.detailRequestFailed', t)}
      />
    );
  }
  if (!detail.data) {
    return (
      <UiEmptyState title={t('admin.users.detail.emptyEyebrow')} description={t('admin.users.detail.emptyTitle')} />
    );
  }
  const userName = detail.data.displayName ?? detail.data.email;
  return (
    <div className="admin-user-detail">
      <div className="admin-user-detail__header">
        <div className="admin-user-detail__identity">
          <UiAvatar src={detail.data.avatarUrl ?? null} name={userName} size={32} alt="" />
          <span>
            <strong>{detail.data.email}</strong>
            <small>{t('admin.users.detail.tenant', { tenantId: detail.data.tenantId })}</small>
          </span>
        </div>
        <div className="admin-user-detail__status-stack">
          <UiStatusTag label={t(statusLabelKey[detail.data.status])} tone={statusTone[detail.data.status]} />
          <span>{t('admin.dashboard.card.access.title')}</span>
        </div>
      </div>
      <div className="admin-detail-metrics">
        <div>
          <span>{detail.data.roles.length}</span>
          <small>{t('admin.users.column.roles')}</small>
        </div>
        <div>
          <span>{detail.data.permissions.length}</span>
          <small>{t('admin.users.filter.permission')}</small>
        </div>
      </div>
      <dl className="xr-profile-list">
        <div>
          <dt>{t('admin.users.column.email')}</dt>
          <dd>{detail.data.email}</dd>
        </div>
        <div>
          <dt>{t('admin.users.column.status')}</dt>
          <dd>{t(statusLabelKey[detail.data.status])}</dd>
        </div>
        <div>
          <dt>{t('admin.users.column.roles')}</dt>
          <dd>{join(detail.data.roles)}</dd>
        </div>
        <div>
          <dt>{t('admin.users.filter.permission')}</dt>
          <dd className="admin-chip-row">
            {detail.data.permissions.length
              ? detail.data.permissions.map((permission) => (
                  <span className="admin-chip" key={permission}>
                    {permission}
                  </span>
                ))
              : join(detail.data.permissions)}
          </dd>
        </div>
      </dl>
    </div>
  );
};
