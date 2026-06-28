import {
  UiCard,
  UiEmptyState,
  UiSection,
  UiStatusTag,
  useI18n,
} from "@app/frontend/ui";

export const ForbiddenPage = ({ reason }: Readonly<{ reason: string }>) => {
  const { t } = useI18n();
  return (
    <UiSection
      className="admin-page admin-state-page"
      eyebrow={t("admin.forbidden.eyebrow")}
      title={t("admin.forbidden.accessDeniedTitle")}
    >
      <UiEmptyState description={reason} title={t("admin.forbidden.title")} />
      <UiCard className="admin-route-card" title="Fail-closed route guard">
        <div className="admin-readiness-card" data-ready="false">
          <div className="admin-readiness-card__header">
            <strong>Access blocked before data load</strong>
            <UiStatusTag label="Denied" tone="warning" />
          </div>
          <p>{reason}</p>
        </div>
      </UiCard>
    </UiSection>
  );
};
