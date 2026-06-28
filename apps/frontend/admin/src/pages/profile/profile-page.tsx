import { UiCard, UiSection, UiStatusTag, useI18n } from "@app/frontend/ui";
import type { AdminProfilePayload } from "../../entities/admin-session";
import { join } from "../../shared";

export const ProfilePage = ({
  payload,
}: Readonly<{ payload: AdminProfilePayload }>) => {
  const { t } = useI18n();
  const profile = payload.profile;
  const unknown = t("admin.profile.unknown");
  return (
    <UiSection
      className="admin-page admin-profile-page"
      eyebrow={t("admin.profile.eyebrow")}
      title={t("admin.profile.title")}
    >
      <UiCard
        className="admin-profile-card"
        title={
          profile?.displayName ??
          profile?.email ??
          t("admin.profile.fallbackDisplayName")
        }
      >
        <div className="admin-profile-card__summary">
          <div className="admin-avatar" aria-hidden="true">
            {(profile?.displayName ?? profile?.email ?? "A").slice(0, 1)}
          </div>
          <UiStatusTag label={t("admin.health.ready")} tone="success" />
        </div>
        <dl className="xr-profile-list">
          <div>
            <dt>{t("user.form.email")}</dt>
            <dd>
              {t("admin.profile.emailLine", {
                value: profile?.email ?? payload.principal?.email ?? unknown,
              })}
            </dd>
          </div>
          <div>
            <dt>{t("admin.dashboard.card.access.title")}</dt>
            <dd>
              {t("admin.profile.subjectLine", {
                value: payload.principal?.subject ?? profile?.id ?? unknown,
              })}
            </dd>
          </div>
          <div>
            <dt>{t("admin.users.column.roles")}</dt>
            <dd>{join(payload.principal?.roles)}</dd>
          </div>
          <div>
            <dt>{t("admin.users.filter.permission")}</dt>
            <dd>{join(payload.principal?.permissions)}</dd>
          </div>
        </dl>
        <div
          className="admin-chip-row"
          aria-label={t("admin.users.filter.permission")}
        >
          {(payload.principal?.permissions?.length
            ? payload.principal.permissions
            : [unknown]
          ).map((permission) => (
            <span className="admin-chip" key={permission}>
              {permission}
            </span>
          ))}
        </div>
      </UiCard>
    </UiSection>
  );
};
