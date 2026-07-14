import { UiErrorBoundary } from '@app/frontend-ui-web';
import { StrictMode } from 'react';
import { App } from './App';

export const LandingReactIsland = function LandingReactIsland() {
  return (
    <StrictMode>
      <UiErrorBoundary>
        <App />
      </UiErrorBoundary>
    </StrictMode>
  );
};
