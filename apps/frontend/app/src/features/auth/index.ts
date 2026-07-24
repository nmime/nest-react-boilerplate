// Auth session domain logic now lives in the shared, platform-neutral feature
// lib so the web app and native mobile consume the same model/hook. The web
// auth-cards UI stays here; both are re-exported to keep the public API stable.
export * from '@app/frontend-feature-user-auth';
export * from './ui/auth-cards';
