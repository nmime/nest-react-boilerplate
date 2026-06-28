import { UiCard, UiEmptyState, UiSection, useI18n } from "@app/frontend/ui";

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
      <UiCard className="admin-route-card" title="Route recovery">
        <div className="admin-readiness-grid">
          {["/admin", "/admin/users", "/admin/profile"].map((path) => (
            <a className="admin-route-link" href={path} key={path}>
              {path}
            </a>
          ))}
        </div>
      </UiCard>
    </UiSection>
  );
};
