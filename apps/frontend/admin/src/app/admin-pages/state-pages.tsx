import { UiEmptyState, UiSection, useI18n } from "@app/frontend-ui";

export const ForbiddenPage = ({ reason }: Readonly<{ reason: string }>) => {
  const { t } = useI18n();
  return (
    <UiSection
      eyebrow={t("admin.forbidden.eyebrow")}
      title={t("admin.forbidden.accessDeniedTitle")}
    >
      <UiEmptyState description={reason} title={t("admin.forbidden.title")} />
    </UiSection>
  );
};
export const NotFoundPage = () => {
  const { t } = useI18n();
  return (
    <UiSection
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
