// Logout domain logic now lives in the shared, platform-neutral feature lib so
// the web app and native mobile consume the same model/hook. The web button UI
// stays here; both are re-exported to keep this feature's public API stable.
export * from '@app/frontend-feature-user-logout';
export * from './ui';
