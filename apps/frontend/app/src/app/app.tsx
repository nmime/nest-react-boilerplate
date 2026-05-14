import { ProductShell, UiCard, UiSection, UiStatCard } from "@app/frontend-ui";

const App = () => (
  <ProductShell
    actions={[
      { href: "#workspace", label: "Explore workspace" },
      { href: "/", label: "System status", variant: "secondary" },
    ]}
    appName="xRocket App"
    description="A focused user application for balances, activity, payments, and account workflows powered by the existing xRocket platform APIs."
    eyebrow="User app"
    status="User workspace"
    statusTone="success"
    title="Personal crypto operations in one reliable workspace."
  >
    <UiSection
      eyebrow="Unified experience"
      title="Built on the shared xRocket UI foundation"
    >
      <div className="xr-card-grid">
        <UiCard title="Wallet overview">
          Track balances and recent account movement from a single operational
          surface.
        </UiCard>
        <UiCard title="Secure actions">
          Keep authenticated workflows consistent with the shared backend auth
          model.
        </UiCard>
        <UiCard title="User journeys">
          Create room for onboarding, payments, settings, and product education.
        </UiCard>
      </div>
      <div className="xr-stat-grid" id="workspace">
        <UiStatCard
          detail="Overview, activity, and settings"
          label="Core zones"
          value="3"
        />
        <UiStatCard
          detail="Unified frontend foundation"
          label="Shared UI"
          value="1"
        />
      </div>
    </UiSection>
  </ProductShell>
);

export default App;
