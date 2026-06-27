import { useCallback } from "react";
import { useI18n } from "@app/frontend/ui";
import { useSocialAuth } from "../../../features/social-auth";
import { TmaAuthPanel, useTmaAuth } from "../../../features/tma-auth";

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
    <TmaAuthPanel
      deepNavigationState={state.deepNavigationState}
      error={state.error}
      intent={state.intent}
      isTelegram={state.isTelegram}
      isVerifying={state.isVerifying}
      status={state.status}
      t={t}
    />
  );
}
