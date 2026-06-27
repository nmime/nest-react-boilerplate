import { UiCard, UiSection, useI18n } from "@app/frontend/ui";
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
      eyebrow={t("admin.profile.eyebrow")}
      title={t("admin.profile.title")}
    >
      <UiCard
        title={
          profile?.displayName ??
          profile?.email ??
          t("admin.profile.fallbackDisplayName")
        }
      >
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
      </UiCard>
    </UiSection>
  );
};
