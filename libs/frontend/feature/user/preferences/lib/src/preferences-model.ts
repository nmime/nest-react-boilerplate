// The preference patch type moved to the shared session-preferences library so
// the admin console shares it. Re-exported to keep this boundary's API stable.
export type { UserPreferencePatch } from '@app/frontend-feature-shared-preferences';
