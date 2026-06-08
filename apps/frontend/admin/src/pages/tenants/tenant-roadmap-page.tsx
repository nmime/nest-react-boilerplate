import { UiEmptyState, UiSection, useI18n } from "@app/frontend-ui";

export const TenantRoadmapPage = () => {
  const { t } = useI18n();
  return (
    <UiSection
      eyebrow={t("admin.tenants.eyebrow")}
      title={t("admin.tenants.title")}
    >
      <UiEmptyState
        title={t("admin.tenants.cardTitle")}
        description={t("admin.tenants.description")}
      />
    </UiSection>
  );
};
