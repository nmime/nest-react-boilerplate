import { FrontendI18nProvider, FrontendStateProvider } from "@app/frontend-ui";
import type { ComponentType } from "react";

export const withLandingProviders = <TProps extends object>(
  Component: ComponentType<TProps>,
) => {
  const ComponentWithLandingProviders = (props: TProps) => (
    <FrontendStateProvider>
      <FrontendI18nProvider>
        <Component {...props} />
      </FrontendI18nProvider>
    </FrontendStateProvider>
  );

  ComponentWithLandingProviders.displayName = `withLandingProviders(${
    Component.displayName ?? Component.name ?? "Component"
  })`;

  return ComponentWithLandingProviders;
};
