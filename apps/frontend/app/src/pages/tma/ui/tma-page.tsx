import { useCallback } from "react";
import { useI18n } from "@app/frontend-ui";
import { useSocialAuth } from "../../../features/social-auth";
import { TmaAuthPanel, useTmaAuth } from "../../../features/tma-auth";

interface TmaPageProps {
  navigate: (to: string, options?: { replace?: boolean }) => void;
}

export function TmaPage({ navigate }: Readonly<TmaPageProps>) {
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
    isVerifying: socialAuth.isTelegramTmaPending,
    onAuthenticate: socialAuth.authenticateTelegramTma,
    onBack: handleBack,
    status: socialAuth.telegramTmaStatus,
  });

  return (
    <TmaAuthPanel
      error={state.error}
      isTelegram={state.isTelegram}
      isVerifying={state.isVerifying}
      status={state.status}
      t={t}
    />
  );
}
