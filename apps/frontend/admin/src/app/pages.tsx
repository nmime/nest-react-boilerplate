import {
  ProductShell,
  UiCard,
  UiSection,
  UiStatCard,
  useI18n,
} from "@app/frontend-ui";
import {
  translate,
  type TranslationKey,
  type TranslationParams,
} from "@app/common/i18n";
import type { AdminAccess, AdminProfilePayload } from "./auth-rbac";

export type AdminProfileState =
  | { status: "loading" }
  | { status: "forbidden"; reason: string }
  | { status: "ready"; payload: AdminProfilePayload; access: AdminAccess };

type Translate = (key: TranslationKey, params?: TranslationParams) => string;
const fallbackTranslate: Translate = (key, params) =>
  translate(key, { params });

export const normalizeAdminPath = (path: string): string => {
  const normalizedPath = path.split("?")[0]?.replace(/\/$/u, "") || "/";

  if (normalizedPath === "/admin") {
    return "/";
  }

  return normalizedPath.startsWith("/admin/")
    ? normalizedPath.slice("/admin".length) || "/"
    : normalizedPath;
};

export const AdminLayout = ({
  children,
}: Readonly<{ children: React.ReactNode }>) => {
  const { t } = useI18n();

  return (
    <ProductShell
      actions={[
        { href: "/admin", label: t("admin.action.dashboard") },
        {
          href: "/admin/profile",
          label: t("admin.action.profile"),
          variant: "secondary",
        },
      ]}
      appName={t("admin.appName")}
      description={t("admin.description")}
      homeHref="/admin"
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
  const none = t("admin.dashboard.access.none");

  return (
    <UiSection
      eyebrow={t("admin.dashboard.eyebrow")}
      title={t("admin.dashboard.title")}
    >
      <div className="xr-card-grid">
        <UiCard title={t("admin.dashboard.card.visibility.title")}>
          {t("admin.dashboard.card.visibility.description")}
        </UiCard>
        <UiCard title={t("admin.dashboard.card.rbac.title")}>
          {t("admin.dashboard.card.rbac.description")}
        </UiCard>
        <UiCard title={t("admin.dashboard.card.access.title")}>
          {t("admin.dashboard.accessSummary", {
            permissions: access.permissions.join(", ") || none,
            roles: access.roles.join(", ") || none,
          })}
        </UiCard>
      </div>
      <div className="xr-stat-grid">
        <UiStatCard
          detail={t("admin.dashboard.stat.profile.detail")}
          label={t("admin.dashboard.stat.profile.label")}
          value={access.canReadProfile ? "1" : "0"}
        />
        <UiStatCard
          detail={t("admin.dashboard.stat.pages.detail")}
          label={t("admin.dashboard.stat.pages.label")}
          value={access.canReadDashboard ? "2" : "0"}
        />
      </div>
    </UiSection>
  );
};

export const ProfilePage = ({
  payload,
}: Readonly<{ payload: AdminProfilePayload }>) => {
  const { t } = useI18n();
  const profile = payload.profile;
  const unknown = t("admin.profile.unknown");

  return (
    <UiSection
      eyebrow={t("admin.profile.eyebrow")}
      title={t("admin.profile.title")}
    >
      <UiCard
        title={
          profile?.displayName ??
          profile?.email ??
          t("admin.profile.fallbackDisplayName")
        }
      >
        <p>
          {t("admin.profile.emailLine", {
            value: profile?.email ?? payload.principal?.email ?? unknown,
          })}
        </p>
        <p>
          {t("admin.profile.subjectLine", {
            value: payload.principal?.subject ?? profile?.id ?? unknown,
          })}
        </p>
      </UiCard>
    </UiSection>
  );
};

export const ForbiddenPage = ({ reason }: Readonly<{ reason: string }>) => {
  const { t } = useI18n();

  return (
    <UiSection
      eyebrow={t("admin.forbidden.eyebrow")}
      title={t("admin.forbidden.accessDeniedTitle")}
    >
      <UiCard title={t("admin.forbidden.title")}>{reason}</UiCard>
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
      <UiCard title={t("admin.notFound.title")}>
        {t("admin.notFound.description")}
      </UiCard>
    </UiSection>
  );
};

export const renderAdminRoute = (
  path: string,
  state: AdminProfileState,
  t: Translate = fallbackTranslate,
): React.ReactNode => {
  if (state.status === "loading") {
    return (
      <UiSection
        eyebrow={t("admin.loadingEyebrow")}
        title={t("admin.loadingProfile")}
      />
    );
  }

  if (state.status === "forbidden") {
    return <ForbiddenPage reason={state.reason} />;
  }

  const routePath = normalizeAdminPath(path);

  if (routePath === "/" || routePath === "/dashboard") {
    return state.access.canReadDashboard ? (
      <DashboardPage access={state.access} />
    ) : (
      <ForbiddenPage reason={t("admin.permission.dashboardMissing")} />
    );
  }

  if (routePath === "/profile") {
    return state.access.canReadProfile ? (
      <ProfilePage payload={state.payload} />
    ) : (
      <ForbiddenPage reason={t("admin.permission.profileMissing")} />
    );
  }

  return <NotFoundPage />;
};
