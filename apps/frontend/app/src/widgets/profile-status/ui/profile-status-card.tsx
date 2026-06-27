import type { TranslationKey, TranslationParams } from "@app/frontend/ui";
import {
  UiAlert,
  UiCard,
  UiEmptyState,
  UiLoading,
  UiStatusPill,
  UiToast,
} from "../../../shared/ui";
import type { ProfileState } from "../../../entities/profile";

export interface ProfileStatusCardProps {
  state: ProfileState;
  t: (key: TranslationKey, params?: TranslationParams) => string;
}

const getProfileTone = (status: ProfileState["status"]) => {
  if (status === "forbidden") {
    return "warning";
  }

  if (status === "ready") {
    return "success";
  }

  return "info";
};

export function ProfileStatusCard({
  state,
  t,
}: Readonly<ProfileStatusCardProps>) {
  return (
    <UiCard
      className="xr-profile-card"
      title={t("user.profile.title")}
      id="profile"
    >
      <div className="xr-status-row">
        <span>{t("user.profile.title")}</span>
        <UiStatusPill
          label={state.status}
          live={state.status === "loading" ? "polite" : "off"}
          tone={getProfileTone(state.status)}
        />
      </div>
      {state.status === "loading" ? (
        <UiAlert tone="info">
          <UiLoading label={t("user.loadingProfile")} />
        </UiAlert>
      ) : null}
      {state.status === "ready" ? (
        <div className="xr-profile-ready">
          <UiToast
            message={t("user.state.ready", {
              subject: state.email ?? state.subject,
            })}
            tone="success"
          />
          <dl className="xr-profile-facts">
            <div>
              <dt>{t("user.form.email")}</dt>
              <dd>{state.email ?? t("user.profile.emailFallback")}</dd>
            </div>
            <div>
              <dt>{t("user.profile.unknown")}</dt>
              <dd>{state.subject}</dd>
            </div>
          </dl>
        </div>
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
