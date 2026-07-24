// Telegram Mini App launch/auth domain logic now lives in the shared,
// platform-neutral feature lib so the web app and native mobile consume the
// same model. The web panel UI stays here; both are re-exported to keep this
// feature's public API stable for existing importers.
export * from '@app/frontend-feature-user-tma-auth';
export * from './ui';
