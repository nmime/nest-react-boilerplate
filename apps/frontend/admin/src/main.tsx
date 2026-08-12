import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import { applyProductBrand, resolveProductBrand } from '@app/frontend-api-support';
import { UiErrorBoundary } from '@app/frontend-ui-web';
import App from './App';
import { getFrontendEnv } from './features/admin-auth';
import './styles.css';

// index.html ships the default identity; the configured brand replaces it before first
// paint so a rebrand is configuration rather than a per-app markup edit.
applyProductBrand(document, resolveProductBrand(getFrontendEnv()));

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
