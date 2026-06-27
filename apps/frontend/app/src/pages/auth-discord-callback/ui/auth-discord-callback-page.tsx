import { useEffect, useMemo } from "react";
import { useI18n } from "@app/frontend/ui";
import { useSocialAuth } from "../../../features/social-auth";
import { getErrorReason } from "../../../shared/lib";
import {
  UiAlert,
  UiCard,
  UiLoading,
  UiStatusPill,
  UiToast,
} from "../../../shared/ui";

interface AuthDiscordCallbackPageProps {
  navigate: (to: string, options?: { replace?: boolean }) => void;
}

type ValidDiscordCallbackQueryState = {
  code: string;
  state: string;
  tenantId?: string;
};

type DiscordCallbackQueryState =
  | ValidDiscordCallbackQueryState
  | { tenantId?: string };

const isValidDiscordCallbackQueryState = (
  query: DiscordCallbackQueryState,
): query is ValidDiscordCallbackQueryState =>
  "code" in query && "state" in query;

const readDiscordCallbackQuery = (): DiscordCallbackQueryState => {
  const searchParams = new URLSearchParams(globalThis.location?.search ?? "");
  const code = searchParams.get("code") ?? undefined;
  const state = searchParams.get("state") ?? undefined;
  const tenantId = searchParams.get("tenantId") ?? undefined;

  return code && state ? { code, state, tenantId } : { tenantId };
};

const getDiscordCallbackTone = (status: string, hasRequiredQuery: boolean) => {
  if (status === "success") {
    return "success";
  }

  return hasRequiredQuery ? "info" : "warning";
};

export function AuthDiscordCallbackPage({
  navigate,
}: Readonly<AuthDiscordCallbackPageProps>) {
  const { t } = useI18n();
  const socialAuth = useSocialAuth({ navigate });
  const query = useMemo(readDiscordCallbackQuery, []);
  const hasRequiredQuery = isValidDiscordCallbackQueryState(query);

  useEffect(() => {
    if (!hasRequiredQuery || socialAuth.discordCallbackStatus !== "idle") {
      return;
    }

    socialAuth.completeDiscordCallback(query);
  }, [hasRequiredQuery, query, socialAuth]);

  return (
    <UiCard
      className="xr-callback-card"
      title={t("auth.social.discord.callback.title")}
    >
      <div className="xr-status-row">
        <span>{t("auth.provider.discord")}</span>
        <UiStatusPill
          label={
            hasRequiredQuery ? socialAuth.discordCallbackStatus : "missing"
          }
          live={socialAuth.isDiscordCallbackPending ? "polite" : "off"}
          tone={getDiscordCallbackTone(
            socialAuth.discordCallbackStatus,
            hasRequiredQuery,
          )}
        />
      </div>
      {hasRequiredQuery && socialAuth.isDiscordCallbackPending ? (
        <UiAlert tone="info">
          <UiLoading label={t("auth.social.discord.callback.loading")} />
        </UiAlert>
      ) : null}
      {!hasRequiredQuery ? (
        <UiToast
          message={t("auth.social.discord.callback.missingState")}
          tone="warning"
        />
      ) : null}
      {socialAuth.discordCallbackStatus === "success" ? (
        <UiToast
          message={t("auth.social.discord.callback.success")}
          tone="success"
        />
      ) : null}
      {socialAuth.discordCallbackStatus === "error" ? (
        <UiToast
          message={getErrorReason(
            socialAuth.discordCallbackError,
            t("auth.social.discord.callback.error"),
          )}
          tone="warning"
        />
      ) : null}
    </UiCard>
  );
}
