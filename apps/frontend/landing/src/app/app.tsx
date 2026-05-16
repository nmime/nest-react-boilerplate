import { ProductShell, UiCard, UiSection, UiStatCard } from "@app/frontend-ui";

const App = () => (
  <ProductShell
    actions={[
      { href: "/app", label: "Open user app" },
      { href: "/admin", label: "Open admin", variant: "secondary" },
      {
        href: "/docs",
        label: "API docs",
        variant: "secondary",
      },
    ]}
    appName="Nest React Boilerplate"
    description="A generic Postgres-ready starter with landing, user, admin, auth API, user API, and admin API surfaces."
    eyebrow="Ready from scratch"
    status="Postgres base"
    statusTone="success"
    title="Launch a full-stack Nest and React product foundation."
  >
    <UiSection
      eyebrow="Workspace"
      title="Three frontends and three APIs are wired together"
    >
      <div className="xr-card-grid" id="workspace">
        <UiCard title="Landing app">
          Public product messaging, app links, and documentation entry points.
        </UiCard>
        <UiCard title="User app">
          Login, register, bearer-token storage, and protected profile loading.
        </UiCard>
        <UiCard title="Admin app">
          Fail-closed RBAC flow using admin roles and permissions.
        </UiCard>
      </div>
      <div className="xr-stat-grid">
        <UiStatCard detail="auth, user, admin" label="APIs" value="3" />
        <UiStatCard detail="landing, user, admin" label="Frontends" value="3" />
      </div>
    </UiSection>
  </ProductShell>
);

export default App;
