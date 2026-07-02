import { useApiRuntimeOverlayModel } from "@app/frontend/api-support";
import {
  FrontendI18nProvider,
  FrontendStateProvider,
  UiApiRuntimeOverlay,
  observer,
  translate,
  useAppStore,
  useStore,
} from "@app/frontend/ui";
import { landingFrontendTranslations } from "@app/frontend/feature/landing/i18n";
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

export const withLandingProviders = <TProps extends object>(
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

  ComponentWithLandingProviders.displayName = `withLandingProviders(${
    Component.displayName ?? Component.name ?? "Component"
  })`;

  return ComponentWithLandingProviders;
};
