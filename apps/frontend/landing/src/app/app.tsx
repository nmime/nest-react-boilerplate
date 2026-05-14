import { ProductShell, UiCard, UiSection, UiStatCard } from "@app/frontend-ui";

const App = () => (
  <ProductShell
    actions={[
      { href: "#workspace", label: "Explore workspace" },
      { href: "/", label: "System status", variant: "secondary" },
    ]}
    appName="xRocket Landing"
    description="A public-facing landing experience that shares the same tokens, layout rhythm, and component language as the app and admin surfaces."
    eyebrow="Landing"
    status="Public surface"
    statusTone="success"
    title="A product front door for the xRocket ecosystem."
  >
    <UiSection
      eyebrow="Unified experience"
      title="Built on the shared xRocket UI foundation"
    >
      <div className="xr-card-grid">
        <UiCard title="Product narrative">
          Introduce the platform with concise value props and clear calls to
          action.
        </UiCard>
        <UiCard title="Trust signals">
          Reserve space for security, networks, liquidity, and operational
          reliability.
        </UiCard>
        <UiCard title="Conversion path">
          Guide users toward app access, support, and account activation.
        </UiCard>
      </div>
      <div className="xr-stat-grid" id="workspace">
        <UiStatCard
          detail="Designed for always-on operations"
          label="Availability"
          value="24/7"
        />
        <UiStatCard
          detail="Shared with app and admin"
          label="Design system"
          value="1"
        />
      </div>
    </UiSection>
  </ProductShell>
);

export default App;
