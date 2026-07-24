// The preferences PATCH helper and auth/me query key moved to the shared
// session-preferences library (the admin console hits the same endpoint).
// Re-exported to keep this boundary's API stable.
export { authPreferencesQueryKey, updateUserPreferences } from '@app/frontend-feature-shared-preferences';
