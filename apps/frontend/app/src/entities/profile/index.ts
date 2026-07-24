// Profile domain logic now lives in the shared, platform-neutral feature lib so
// the web app and native mobile consume the same models. Re-exported here to
// keep this FSD entity's public API stable for existing importers.
export * from '@app/frontend-feature-user-profile';
