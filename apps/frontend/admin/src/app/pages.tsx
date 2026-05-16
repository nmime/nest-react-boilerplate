import { ProductShell, UiCard, UiSection, UiStatCard } from "@app/frontend-ui";
import type { AdminAccess, AdminProfilePayload } from "./auth-rbac";

export type AdminProfileState =
  | { status: "missing-token" }
  | { status: "loading" }
  | { status: "forbidden"; reason: string }
  | { status: "ready"; payload: AdminProfilePayload; access: AdminAccess };

export const AdminLayout = ({
  children,
}: Readonly<{ children: React.ReactNode }>) => (
  <ProductShell
    actions={[
      { href: "/", label: "Dashboard" },
      { href: "/profile", label: "Profile", variant: "secondary" },
    ]}
    appName="Admin App"
    description="A guarded operational command surface for support, risk, and platform administration workflows."
    eyebrow="Admin console"
    status="RBAC protected"
    statusTone="warning"
    title="Operate the product platform with a fail-closed admin experience."
  >
    {children}
  </ProductShell>
);

export const DashboardPage = ({
  access,
}: Readonly<{ access: AdminAccess }>) => (
  <UiSection eyebrow="Dashboard" title="Admin operations">
    <div className="xr-card-grid">
      <UiCard title="Operational visibility">
        Monitor users, payments, and platform workflows from a consistent admin
        shell.
      </UiCard>
      <UiCard title="Fail-closed RBAC">
        Dashboard access is granted only when the bearer token carries the admin
        role and dashboard permission.
      </UiCard>
      <UiCard title="Current access">
        Roles: {access.roles.join(", ") || "none"}. Permissions:{" "}
        {access.permissions.join(", ") || "none"}.
      </UiCard>
    </div>
    <div className="xr-stat-grid" id="operations">
      <UiStatCard
        detail="Fetched from /admin/profile/me"
        label="Profile"
        value="1"
      />
      <UiStatCard detail="Admin shell routes" label="Pages" value="4" />
    </div>
  </UiSection>
);

export const ProfilePage = ({
  payload,
}: Readonly<{ payload: AdminProfilePayload }>) => {
  const profile = payload.profile;

  return (
    <UiSection eyebrow="Profile" title="Signed-in administrator">
      <UiCard title={profile?.displayName ?? profile?.email ?? "Administrator"}>
        <p>Email: {profile?.email ?? payload.principal?.email ?? "unknown"}</p>
        <p>Subject: {payload.principal?.subject ?? profile?.id ?? "unknown"}</p>
      </UiCard>
    </UiSection>
  );
};

export const ForbiddenPage = ({ reason }: Readonly<{ reason: string }>) => (
  <UiSection eyebrow="Forbidden" title="Access denied">
    <UiCard title="RBAC denied">{reason}</UiCard>
  </UiSection>
);

export const NotFoundPage = () => (
  <UiSection eyebrow="Not found" title="Admin page not found">
    <UiCard title="Unknown route">Choose dashboard or profile.</UiCard>
  </UiSection>
);

export const DevTokenForm = ({
  onSubmit,
}: Readonly<{ onSubmit: (token: string) => void }>) => (
  <form
    aria-label="Development bearer token"
    onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const token = form.get("token");
      onSubmit(typeof token === "string" ? token : "");
    }}
  >
    <label>
      Bearer token
      <input name="token" placeholder="Paste development token" />
    </label>
    <button type="submit">Use token</button>
  </form>
);

export const renderAdminRoute = (
  path: string,
  state: AdminProfileState,
): React.ReactNode => {
  if (state.status === "missing-token") {
    return (
      <ForbiddenPage reason="Provide a bearer token via ?admin_token=, localStorage, or the development form." />
    );
  }

  if (state.status === "loading") {
    return (
      <UiSection eyebrow="Loading" title="Loading administrator profile" />
    );
  }

  if (state.status === "forbidden") {
    return <ForbiddenPage reason={state.reason} />;
  }

  if (path === "/" || path === "/dashboard") {
    return state.access.canReadDashboard ? (
      <DashboardPage access={state.access} />
    ) : (
      <ForbiddenPage reason="Missing admin dashboard permission." />
    );
  }

  if (path === "/profile") {
    return state.access.canReadProfile ? (
      <ProfilePage payload={state.payload} />
    ) : (
      <ForbiddenPage reason="Missing admin profile permission." />
    );
  }

  return <NotFoundPage />;
};
