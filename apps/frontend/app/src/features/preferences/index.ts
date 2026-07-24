// Preference domain logic now lives in the shared, platform-neutral feature lib
// so the web app and native mobile consume the same model. Re-exported here to
// keep this FSD feature's public API stable for existing importers.
export * from '@app/frontend-feature-user-preferences';
