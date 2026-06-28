import { useCallback } from "react";
import { useI18n } from "@app/frontend/ui";
import { useSocialAuth } from "../../../features/social-auth";
import { TmaAuthPanel, useTmaAuth } from "../../../features/tma-auth";
import {
  UiAlert,
  UiCard,
  UiSection,
  UiStatCard,
  UiStatusPill,
} from "../../../shared/ui";

interface TmaPageProps {
  fallbackStartParam?: string;
  navigate: (to: string, options?: { replace?: boolean }) => void;
}

export function TmaPage({
  fallbackStartParam,
  navigate,
}: Readonly<TmaPageProps>) {
  const { t } = useI18n();
  const handleBack = useCallback(() => {
    if (globalThis.history.length > 1) {
      globalThis.history.back();
      return;
    }
    navigate("/", { replace: true });
  }, [navigate]);
  const socialAuth = useSocialAuth({ navigate });
  const state = useTmaAuth({
    error: socialAuth.telegramTmaError,
    fallbackStartParam,
    isVerifying: socialAuth.isTelegramTmaPending,
    onAuthenticate: socialAuth.authenticateTelegramTma,
    onBack: handleBack,
    status: socialAuth.telegramTmaStatus,
  });

  return (
    <UiSection
      className="xr-tma-section"
      eyebrow="Telegram"
      title="Telegram Mini App access"
    >
      <div className="xr-tma-layout" data-design-marker="tma-v3">
        <UiCard
          className="xr-tma-intro xr-surface-glow"
          title="Mini App handoff"
        >
          <div className="xr-card-stack">
            <UiAlert className="xr-inline-alert" tone="info">
              <strong>
                {state.intent === "link"
                  ? t("tma.link.required")
                  : t("tma.idle")}
              </strong>
              <span>
                Deep links, Telegram launch data, and fallback routes share one
                verification surface.
              </span>
            </UiAlert>
            <div className="xr-status-row">
              <span className="xr-status-heading">Telegram environment</span>
              <UiStatusPill
                label={state.isTelegram ? "detected" : "browser fallback"}
                tone={state.isTelegram ? "success" : "warning"}
              />
            </div>
          </div>
        </UiCard>
        <div className="xr-stat-grid xr-stat-grid--compact">
          <UiStatCard detail="/tma/auth" label="Auth route" value="ready" />
          <UiStatCard
            detail="/link/telegram"
            label="Link route"
            value="ready"
          />
          <UiStatCard
            detail={state.deepNavigationState}
            label="Deep link"
            value={state.status}
          />
        </div>
        <TmaAuthPanel
          deepNavigationState={state.deepNavigationState}
          error={state.error}
          intent={state.intent}
          isTelegram={state.isTelegram}
          isVerifying={state.isVerifying}
          status={state.status}
          t={t}
        />
      </div>
    </UiSection>
  );
}
