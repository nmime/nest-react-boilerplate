import { UiEmptyState, UiSection, useI18n } from "@app/frontend/ui";

export const ForbiddenPage = ({ reason }: Readonly<{ reason: string }>) => {
  const { t } = useI18n();
  return (
    <UiSection
      className="admin-page admin-state-page"
      eyebrow={t("admin.forbidden.eyebrow")}
      title={t("admin.forbidden.accessDeniedTitle")}
    >
      <UiEmptyState description={reason} title={t("admin.forbidden.title")} />
    </UiSection>
  );
};
