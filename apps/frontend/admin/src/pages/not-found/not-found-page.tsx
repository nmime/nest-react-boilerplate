import { UiEmptyState, UiSection, useI18n } from "@app/frontend/ui";

export const NotFoundPage = () => {
  const { t } = useI18n();
  return (
    <UiSection
      className="admin-page admin-state-page"
      eyebrow={t("admin.notFound.eyebrow")}
      title={t("admin.notFound.sectionTitle")}
    >
      <UiEmptyState
        description={t("admin.notFound.description")}
        title={t("admin.notFound.title")}
      />
    </UiSection>
  );
};
