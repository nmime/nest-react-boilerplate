import { useApiRuntimeOverlayModel } from "@app/frontend/api-support";
import {
  FrontendI18nProvider,
  FrontendStateProvider,
  UiApiRuntimeOverlay,
  observer,
  useAppStore,
} from "@app/frontend/ui";
import type { ComponentType } from "react";

const LandingRuntimeOverlayProvider = observer(
  function LandingRuntimeOverlayProvider() {
    const appStore = useAppStore();
    const { dismissToast, state, toasts } = useApiRuntimeOverlayModel();

    return (
      <UiApiRuntimeOverlay
        authRequired={state.authRequired}
        className={`xr-runtime-overlay--${appStore.currentBreakpoint}`}
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
      <FrontendI18nProvider>
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
