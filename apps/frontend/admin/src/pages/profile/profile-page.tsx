import { useI18n } from '@app/frontend-runtime';
import { UiAvatar, UiCard, UiSection, UiStatusTag } from '@app/frontend-ui-web';
import type { AdminProfilePayload } from '../../entities/admin-session';
import { join } from '../../shared';

export const ProfilePage = ({ payload }: Readonly<{ payload: AdminProfilePayload }>) => {
  const { t } = useI18n();
  const profile = payload.profile;
  const unknown = t('admin.profile.unknown');
  const roles = payload.principal?.roles ?? [];
  const permissions = payload.principal?.permissions ?? [];
  const permissionGroups = permissions.reduce<Map<string, string[]>>((groups, permission) => {
    const parts = permission.split(':');
    const group = parts.length > 1 ? parts.slice(0, -1).join(':') : permission;
    const current = groups.get(group) ?? [];
    current.push(permission);
    groups.set(group, current);
    return groups;
  }, new Map());
  return (
    <UiSection
      className="admin-page admin-profile-page"
      eyebrow={t('admin.profile.eyebrow')}
      headingLevel={1}
      title={t('admin.profile.title')}
    >
      <UiCard
        className="admin-profile-card"
        title={profile?.displayName ?? profile?.email ?? t('admin.profile.fallbackDisplayName')}
      >
        <div className="admin-profile-card__summary">
          <UiAvatar
            src={profile?.avatarUrl ?? null}
            name={profile?.displayName ?? profile?.email ?? 'U'}
            size={40}
            alt=""
          />
          <UiStatusTag label={t('admin.health.ready')} tone="success" />
        </div>
        <dl className="xr-profile-list">
          <div>
            <dt>{t('admin.users.column.email')}</dt>
            <dd>
              {t('admin.profile.emailLine', {
                value: profile?.email ?? payload.principal?.email ?? unknown,
              })}
            </dd>
          </div>
          <div>
            <dt>{t('admin.dashboard.card.access.title')}</dt>
            <dd>
              {t('admin.profile.subjectLine', {
                value: payload.principal?.subject ?? profile?.id ?? unknown,
              })}
            </dd>
          </div>
          <div>
            <dt>{t('admin.users.column.roles')}</dt>
            <dd className="admin-chip-row">
              {(roles.length ? roles : [unknown]).map((role) => (
                <span className="admin-chip admin-chip--strong" key={role}>
                  {role}
                </span>
              ))}
            </dd>
          </div>
          <div>
            <dt>{t('admin.users.filter.permission')}</dt>
            <dd>{permissions.length}</dd>
          </div>
        </dl>
        <section className="admin-profile-permissions" aria-label={t('admin.users.filter.permission')}>
          <div className="admin-profile-permissions__heading">
            <h3>{t('admin.users.filter.permission')}</h3>
            <span>{permissions.length}</span>
          </div>
          <div className="admin-profile-permissions__groups">
            {permissionGroups.size ? (
              [...permissionGroups].map(([group, groupPermissions]) => (
                <div className="admin-profile-permission-group" key={group}>
                  <strong>{group}</strong>
                  <div className="admin-chip-row">
                    {groupPermissions.map((permission) => (
                      <code className="admin-profile-permission" key={permission}>
                        {permission.split(':').at(-1)}
                      </code>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <p>{join([unknown])}</p>
            )}
          </div>
        </section>
      </UiCard>
    </UiSection>
  );
};
