import type { TranslationKey, TranslationParams } from "@app/frontend/ui";
import type { SubmitEvent, ReactNode } from "react";
import { AuthCards, type AuthMode } from "../../../features/auth";
import { getUserAppApiModeLabel } from "../../../shared/config";
import {
  UiAlert,
  UiSection,
  UiStatCard,
  UiStatusPill,
} from "../../../shared/ui";

export interface AuthPanelProps {
  isLoginPending: boolean;
  isRegisterPending: boolean;
  loadingLabel: string;
  onAuthSubmit: (mode: AuthMode, event: SubmitEvent<HTMLFormElement>) => void;
  children: ReactNode;
  t: (key: TranslationKey, params?: TranslationParams) => string;
  socialAuthSlot?: ReactNode;
}

export function AuthPanel({
  isLoginPending,
  isRegisterPending,
  loadingLabel,
  onAuthSubmit,
  children,
  t,
  socialAuthSlot,
}: Readonly<AuthPanelProps>) {
  const apiModeLabel = getUserAppApiModeLabel();

  return (
    <UiSection eyebrow={t("user.auth.eyebrow")} title={t("user.auth.title")}>
      <UiAlert className="xr-readiness-alert" tone="info">
        <strong>{t("user.status")}</strong>
        <span>{apiModeLabel}</span>
        <UiStatusPill label={t("user.nav.auth")} tone="success" />
      </UiAlert>
      <div className="xr-card-grid" id="auth">
        <AuthCards
          isLoginPending={isLoginPending}
          isRegisterPending={isRegisterPending}
          loadingLabel={loadingLabel}
          onSubmit={onAuthSubmit}
          t={t}
          socialAuthSlot={socialAuthSlot}
        />
        {children}
      </div>
      <div className="xr-stat-grid">
        <UiStatCard
          detail={t("user.stat.authApi.detail")}
          label={t("user.stat.authApi.label")}
          value="3003"
        />
        <UiStatCard
          detail={t("user.stat.userApi.detail")}
          label={t("user.stat.userApi.label")}
          value="3002"
        />
        <UiStatCard detail={apiModeLabel} label="API mode" value="ready" />
      </div>
    </UiSection>
  );
}
