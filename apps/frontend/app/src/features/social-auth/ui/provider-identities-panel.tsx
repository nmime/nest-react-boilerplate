import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthApiClient } from "@app/frontend/api-client";
import {
  useAuthShellStore,
  type TranslationKey,
  type TranslationParams,
} from "@app/frontend/ui";
import { getErrorReason } from "../../../shared/lib";
import {
  UiButton,
  UiCard,
  UiEmptyState,
  UiLoading,
  UiStatusPill,
  UiToast,
} from "../../../shared/ui";
import {
  fetchProviderIdentities,
  providerIdentitiesQueryKey,
  unlinkProviderIdentity,
} from "../api";
import {
  getProviderTranslationKey,
  normalizeProviderIdentities,
  socialAuthProviders,
  type ProviderIdentity,
  type SocialAuthProvider,
} from "../model";

interface ProviderIdentitiesPanelProps {
  onLink: (provider: SocialAuthProvider) => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
}

const unlinkButtonKey: Record<SocialAuthProvider, TranslationKey> = {
  discord: "auth.social.button.unlinkDiscord",
  telegram: "auth.social.button.unlinkTelegram",
};

const linkButtonKey: Record<SocialAuthProvider, TranslationKey> = {
  discord: "auth.social.button.linkDiscord",
  telegram: "auth.social.button.linkTelegram",
};

const getIdentityLabel = (
  identity: ProviderIdentity,
  fallback: string,
): string =>
  identity.email ??
  identity.displayName ??
  identity.username ??
  identity.providerSubject ??
  fallback;

const getUnlinkProviderName = (
  identityId: string | undefined,
  identities: ProviderIdentity[],
) => {
  const provider = identities.find(
    (identity) => identity.id === identityId,
  )?.provider;
  return provider
    ? getProviderTranslationKey(provider)
    : "auth.provider.telegram";
};

const getUnlinkErrorKey = (error: unknown): TranslationKey => {
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    (error as { status?: unknown }).status === 409
  ) {
    return "auth.social.lastMethod.blocked";
  }

  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    (error as { status?: unknown }).status === 403
  ) {
    return "auth.social.stepUp.required";
  }

  return "auth.social.unlink.error";
};

export function ProviderIdentitiesPanel({
  onLink,
  t,
}: Readonly<ProviderIdentitiesPanelProps>) {
  const authClient = useAuthApiClient();
  const authStore = useAuthShellStore();
  const queryClient = useQueryClient();
  const identitiesQuery = useQuery({
    enabled: authStore.isAuthenticated,
    queryFn: () => fetchProviderIdentities(authClient),
    queryKey: providerIdentitiesQueryKey(),
    retry: false,
  });
  const unlinkMutation = useMutation({
    mutationFn: (identityId: string) =>
      unlinkProviderIdentity(authClient, identityId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: providerIdentitiesQueryKey() }),
    retry: false,
  });
  const state = normalizeProviderIdentities(identitiesQuery.data);
  const unlinkProviderName = t(
    getUnlinkProviderName(unlinkMutation.variables, state.identities),
  );

  return (
    <UiCard
      className="xr-provider-card xr-surface-glow"
      title={t("user.settings.title")}
    >
      <div className="xr-status-row">
        <span className="xr-status-heading">
          {t("auth.social.stepUp.required")}
        </span>
        <UiStatusPill
          label={authStore.isAuthenticated ? "session" : "signed out"}
          tone={authStore.isAuthenticated ? "success" : "warning"}
        />
      </div>
      {!authStore.isAuthenticated ? (
        <UiEmptyState
          description={t("user.state.missingToken")}
          title={t("user.profile.title")}
        />
      ) : null}
      {identitiesQuery.isLoading ? (
        <UiLoading label={t("user.loadingProfile")} />
      ) : null}
      {identitiesQuery.isError ? (
        <UiToast
          message={getErrorReason(
            identitiesQuery.error,
            t("auth.social.error.providerUnavailable", {
              provider: t("auth.provider.telegram"),
            }),
          )}
          tone="warning"
        />
      ) : null}
      <div className="xr-provider-list" data-design-marker="social-linking-v3">
        <div className="xr-provider-list__intro">
          <strong>Connected identity map</strong>
          <span>
            Review linked providers, add a recovery path, or unlink safely.
          </span>
        </div>
        {socialAuthProviders.map((provider) => {
          const identity = state.providers[provider];
          const providerName = t(getProviderTranslationKey(provider));
          return (
            <section className="xr-provider-row" key={provider}>
              <div>
                <div className="xr-provider-heading">
                  <strong>{providerName}</strong>
                  <UiStatusPill
                    label={identity ? "linked" : "not linked"}
                    tone={identity ? "success" : "info"}
                  />
                </div>
                <p>
                  {identity
                    ? t("auth.social.status.linked", { provider: providerName })
                    : t("auth.social.status.notLinked", {
                        provider: providerName,
                      })}
                </p>
                {identity ? (
                  <p>
                    {getIdentityLabel(
                      identity,
                      t("user.profile.emailFallback"),
                    )}
                  </p>
                ) : null}
                {identity?.isLastMethod ? (
                  <p>{t("auth.social.lastMethod.warning")}</p>
                ) : null}
              </div>
              {identity ? (
                <UiButton
                  disabled={identity.isLastMethod}
                  isLoading={
                    unlinkMutation.isPending &&
                    unlinkMutation.variables === identity.id
                  }
                  loadingLabel={t("auth.social.status.pending", {
                    provider: providerName,
                  })}
                  onClick={() => unlinkMutation.mutate(identity.id)}
                  type="button"
                  variant="secondary"
                >
                  {t(unlinkButtonKey[provider])}
                </UiButton>
              ) : (
                <UiButton
                  onClick={() => onLink(provider)}
                  type="button"
                  variant="secondary"
                >
                  {t(linkButtonKey[provider])}
                </UiButton>
              )}
            </section>
          );
        })}
      </div>
      {unlinkMutation.isError ? (
        <UiToast
          message={t(getUnlinkErrorKey(unlinkMutation.error), {
            provider: unlinkProviderName,
          })}
          tone="warning"
        />
      ) : null}
      {unlinkMutation.isSuccess ? (
        <UiToast
          message={t("auth.social.unlink.success", {
            provider: unlinkProviderName,
          })}
          tone="success"
        />
      ) : null}
    </UiCard>
  );
}
