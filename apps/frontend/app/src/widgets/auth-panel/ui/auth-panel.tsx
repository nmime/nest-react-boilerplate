import type { TranslationKey, TranslationParams } from "@app/common/i18n";
import type { FormEvent, ReactNode } from "react";
import { AuthCards, type AuthMode } from "../../../features/auth";
import { UiSection, UiStatCard } from "../../../shared/ui";

export interface AuthPanelProps {
  isLoginPending: boolean;
  isRegisterPending: boolean;
  loadingLabel: string;
  onAuthSubmit: (mode: AuthMode, event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
  t: (key: TranslationKey, params?: TranslationParams) => string;
}

export function AuthPanel({
  isLoginPending,
  isRegisterPending,
  loadingLabel,
  onAuthSubmit,
  children,
  t,
}: Readonly<AuthPanelProps>) {
  return (
    <UiSection eyebrow={t("user.auth.eyebrow")} title={t("user.auth.title")}>
      <div className="xr-card-grid" id="auth">
        <AuthCards
          isLoginPending={isLoginPending}
          isRegisterPending={isRegisterPending}
          loadingLabel={loadingLabel}
          onSubmit={onAuthSubmit}
          t={t}
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
      </div>
    </UiSection>
  );
}
