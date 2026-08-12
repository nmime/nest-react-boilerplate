import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import { UiErrorBoundary } from '@app/frontend-ui-web';
import App from './app/app';
import { applyProductBrand } from '@app/frontend-api-support';
import { resolveAppProductBrand } from './shared/config';

// index.html ships the boilerplate identity; the configured brand replaces it
// before first paint so a rebrand is configuration, not a source sweep.
applyProductBrand(document, resolveAppProductBrand());

const container = document.getElementById('root');

if (!container) {
  throw new Error('Missing required root element with id "root".');
}

const root = ReactDOM.createRoot(container);

root.render(
  <StrictMode>
    <UiErrorBoundary>
      <App />
    </UiErrorBoundary>
  </StrictMode>,
);
