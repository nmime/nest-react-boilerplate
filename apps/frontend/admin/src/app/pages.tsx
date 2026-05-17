import {
  ProductShell,
  UiCard,
  UiSection,
  UiStatCard,
  useI18n,
} from "@app/frontend-ui";
import { translate, type TranslationKey } from "@app/common/i18n";
import type { AdminProfilePayload } from "@app/frontend-api-client";
import type { AdminAccess } from "./auth-rbac";

export type AdminProfileState =
  | { status: "missing-token" }
  | { status: "loading" }
  | { status: "forbidden"; reason: string }
  | { status: "ready"; payload: AdminProfilePayload; access: AdminAccess };

type Translate = (key: TranslationKey) => string;
const fallbackTranslate: Translate = (key) => translate(key);

export const AdminLayout = ({
  children,
}: Readonly<{ children: React.ReactNode }>) => {
  const { t } = useI18n();

  return (
    <ProductShell
      actions={[
        { href: "/", label: t("admin.action.dashboard") },
        {
          href: "/profile",
          label: t("admin.action.profile"),
          variant: "secondary",
        },
      ]}
      appName={t("admin.appName")}
      description={t("admin.description")}
      eyebrow={t("admin.eyebrow")}
      status={t("admin.status")}
      statusTone="warning"
      title={t("admin.title")}
    >
      {children}
    </ProductShell>
  );
};

export const DashboardPage = ({
  access,
}: Readonly<{ access: AdminAccess }>) => {
  const { t } = useI18n();

  return (
    <UiSection eyebrow="Dashboard" title={t("admin.dashboard.title")}>
      <div className="xr-card-grid">
        <UiCard title="Operational visibility">
          Monitor users, payments, and platform workflows from a consistent
          admin shell.
        </UiCard>
        <UiCard title="Fail-closed RBAC">
          Dashboard access is granted only when the bearer token carries the
          admin role and dashboard permission.
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
};

export const ProfilePage = ({
  payload,
}: Readonly<{ payload: AdminProfilePayload }>) => {
  const { t } = useI18n();
  const profile = payload.profile;

  return (
    <UiSection eyebrow="Profile" title={t("admin.profile.title")}>
      <UiCard title={profile?.displayName ?? profile?.email ?? "Administrator"}>
        <p>Email: {profile?.email ?? payload.principal?.email ?? "unknown"}</p>
        <p>Subject: {payload.principal?.subject ?? profile?.id ?? "unknown"}</p>
      </UiCard>
    </UiSection>
  );
};

export const ForbiddenPage = ({ reason }: Readonly<{ reason: string }>) => {
  const { t } = useI18n();

  return (
    <UiSection eyebrow="Forbidden" title="Access denied">
      <UiCard title={t("admin.forbidden.title")}>{reason}</UiCard>
    </UiSection>
  );
};

export const NotFoundPage = () => {
  const { t } = useI18n();

  return (
    <UiSection eyebrow="Not found" title="Admin page not found">
      <UiCard title={t("admin.notFound.title")}>
        {t("admin.notFound.description")}
      </UiCard>
    </UiSection>
  );
};

export const DevTokenForm = ({
  onSubmit,
}: Readonly<{ onSubmit: (token: string) => void }>) => {
  const { t } = useI18n();

  return (
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
        {t("admin.form.bearerToken")}
        <input name="token" placeholder="Paste development token" />
      </label>
      <button type="submit">{t("admin.form.saveToken")}</button>
    </form>
  );
};

export const renderAdminRoute = (
  path: string,
  state: AdminProfileState,
  t: Translate = fallbackTranslate,
): React.ReactNode => {
  if (state.status === "missing-token") {
    return <ForbiddenPage reason={t("admin.state.missingToken")} />;
  }

  if (state.status === "loading") {
    return <UiSection eyebrow="Loading" title={t("admin.loadingProfile")} />;
  }

  if (state.status === "forbidden") {
    return <ForbiddenPage reason={state.reason} />;
  }

  if (path === "/" || path === "/dashboard") {
    return state.access.canReadDashboard ? (
      <DashboardPage access={state.access} />
    ) : (
      <ForbiddenPage reason={t("admin.permission.dashboardMissing")} />
    );
  }

  if (path === "/profile") {
    return state.access.canReadProfile ? (
      <ProfilePage payload={state.payload} />
    ) : (
      <ForbiddenPage reason={t("admin.permission.profileMissing")} />
    );
  }

  return <NotFoundPage />;
};
