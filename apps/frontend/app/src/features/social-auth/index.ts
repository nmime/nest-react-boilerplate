// Social-auth (Telegram/Discord) domain logic now lives in the shared,
// platform-neutral feature lib so the web app and native mobile consume the
// same models/hook. The web panel + buttons UI stay here; both are re-exported
// to keep this feature's public API stable for existing importers.
export * from '@app/frontend-feature-user-social-auth';
export * from './ui';
