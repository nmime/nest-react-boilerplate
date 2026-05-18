import {
  FrontendI18nProvider,
  FrontendStateProvider,
  ProductShell,
  UiCard,
  UiSection,
  UiStatCard,
  useI18n,
} from "@app/frontend-ui";

const LandingApp = () => {
  const { t } = useI18n();

  return (
    <ProductShell
      actions={[
        { href: "/app", label: t("landing.action.user") },
        {
          href: "/admin",
          label: t("landing.action.admin"),
          variant: "secondary",
        },
        {
          href: "/docs",
          label: "API docs",
          variant: "secondary",
        },
      ]}
      appName="Nest React Boilerplate"
      description={t("landing.description")}
      eyebrow={t("landing.eyebrow")}
      status={t("common.status.ready")}
      statusTone="success"
      title={t("landing.title")}
    >
      <UiSection eyebrow="Workspace" title={t("landing.section.title")}>
        <div className="xr-card-grid" id="workspace">
          <UiCard title={t("landing.card.api")}>
            auth-app-api, user-app-api, and admin-app-api.
          </UiCard>
          <UiCard title={t("landing.card.frontend")}>
            landing, user, and admin React surfaces share one i18n provider.
          </UiCard>
          <UiCard title={t("landing.card.ops")}>
            Docker, health checks, OpenAPI, and deployment defaults stay wired.
          </UiCard>
        </div>
        <div className="xr-stat-grid">
          <UiStatCard detail="auth, user, admin" label="APIs" value="3" />
          <UiStatCard
            detail="landing, user, admin"
            label={t("landing.stat.apps")}
            value="3"
          />
        </div>
      </UiSection>
    </ProductShell>
  );
};

const App = () => (
  <FrontendStateProvider>
    <FrontendI18nProvider>
      <LandingApp />
    </FrontendI18nProvider>
  </FrontendStateProvider>
);

export default App;
