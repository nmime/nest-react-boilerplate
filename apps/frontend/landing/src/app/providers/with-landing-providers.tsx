import { useApiRuntimeOverlayModel } from "@app/frontend-api-support";
import {
  FrontendI18nProvider,
  FrontendStateProvider,
  observer,
  translate,
  useAppStore,
  useStore,
} from "@app/frontend-runtime";
import { UiApiRuntimeOverlay } from "@app/frontend-ui-web";
import { landingFrontendTranslations } from "@app/frontend-feature-landing-i18n";
import type { ComponentType } from "react";

const LandingRuntimeOverlayProvider = observer(
  function LandingRuntimeOverlayProvider() {
    const appStore = useAppStore();
    const locale = useStore().locale.locale;
    const { dismissToast, state, toasts } = useApiRuntimeOverlayModel();

    return (
      <UiApiRuntimeOverlay
        authRequired={state.authRequired}
        className={`xr-runtime-overlay--${appStore.currentBreakpoint}`}
        copy={{
          apiNotificationsLabel: translate("ui.runtime.notifications.label", {
            locale,
          }),
          authRequiredTitle: translate("ui.runtime.authRequired.title", {
            locale,
          }),
          continueToSignInLabel: translate("ui.runtime.authRequired.continue", {
            locale,
          }),
          defaultAuthDescription: translate(
            "ui.runtime.authRequired.description",
            { locale },
          ),
          defaultOfflineMessage: translate("ui.runtime.offline.description", {
            locale,
          }),
          defaultServerErrorMessage: translate(
            "ui.runtime.serverUnavailable.description",
            { locale },
          ),
          dismissLabel: translate("ui.runtime.dismissToast", { locale }),
          offlineTitle: translate("ui.runtime.offline.title", { locale }),
          serverErrorTitle: translate("ui.runtime.serverUnavailable.title", {
            locale,
          }),
        }}
        lastError={state.lastError}
        onDismissToast={dismissToast}
        redirectTo={state.redirectTo ?? "/"}
        status={state.status}
        toasts={toasts}
      />
    );
  },
);

export const withLandingProviders = <TProps extends Record<string, unknown>>(
  Component: ComponentType<TProps>,
) => {
  const ComponentWithLandingProviders = (props: TProps) => (
    <FrontendStateProvider>
      <FrontendI18nProvider translations={landingFrontendTranslations}>
        <Component {...props} />
        <LandingRuntimeOverlayProvider />
      </FrontendI18nProvider>
    </FrontendStateProvider>
  );

  // `name` is typed as `string` on functions but is undefined for some
  // component shapes (e.g. objects whose `name` has been cleared), so treat it
  // as an optional boundary before falling back to a stable label.
  const named = Component as { displayName?: string; name?: string };
  ComponentWithLandingProviders.displayName = `withLandingProviders(${
    named.displayName ?? named.name ?? "Component"
  })`;

  return ComponentWithLandingProviders;
};
