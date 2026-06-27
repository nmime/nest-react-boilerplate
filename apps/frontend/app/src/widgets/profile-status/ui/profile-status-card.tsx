import type { TranslationKey, TranslationParams } from "@app/frontend/ui";
import { UiCard, UiEmptyState, UiLoading, UiToast } from "../../../shared/ui";
import type { ProfileState } from "../../../entities/profile";

export interface ProfileStatusCardProps {
  state: ProfileState;
  t: (key: TranslationKey, params?: TranslationParams) => string;
}

export function ProfileStatusCard({
  state,
  t,
}: Readonly<ProfileStatusCardProps>) {
  return (
    <UiCard title={t("user.profile.title")} id="profile">
      {state.status === "loading" ? (
        <UiLoading label={t("user.loadingProfile")} />
      ) : null}
      {state.status === "ready" ? (
        <UiToast
          message={t("user.state.ready", {
            subject: state.email ?? state.subject,
          })}
          tone="success"
        />
      ) : null}
      {state.status === "missing-token" ? (
        <UiEmptyState
          description={state.reason}
          title={t("user.profile.title")}
        />
      ) : null}
      {state.status === "forbidden" ? (
        <UiToast
          message={t("user.state.forbidden", { reason: state.reason })}
          tone="warning"
        />
      ) : null}
    </UiCard>
  );
}
