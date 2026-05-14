import { ProductShell, UiCard, UiSection, UiStatCard } from "@app/frontend-ui";

const App = () => (
  <ProductShell
    actions={[
      { href: "#operations", label: "Review operations" },
      { href: "/", label: "System status", variant: "secondary" },
    ]}
    appName="xRocket Admin"
    description="An operational command surface for support, risk, and platform administration workflows."
    eyebrow="Admin console"
    status="Internal surface"
    statusTone="warning"
    title="Operate the xRocket platform with a unified admin experience."
  >
    <UiSection
      eyebrow="Unified experience"
      title="Built on the shared xRocket UI foundation"
    >
      <div className="xr-card-grid">
        <UiCard title="Operational visibility">
          Monitor user, payment, and platform workflows from a consistent admin
          shell.
        </UiCard>
        <UiCard title="Risk-aware actions">
          Reserve space for approvals, audit trails, and guarded administrative
          tasks.
        </UiCard>
        <UiCard title="Reusable interface">
          Admin, user app, and landing surfaces now consume one frontend UI
          foundation.
        </UiCard>
      </div>
      <div className="xr-stat-grid" id="operations">
        <UiStatCard
          detail="Admin, user app, and landing"
          label="Frontend apps"
          value="3"
        />
        <UiStatCard
          detail="Tokens, shell, cards, actions"
          label="Shared UI"
          value="1"
        />
      </div>
    </UiSection>
  </ProductShell>
);

export default App;
