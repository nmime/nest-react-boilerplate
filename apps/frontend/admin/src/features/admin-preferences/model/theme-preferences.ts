// The payload theme reader moved to the shared session-preferences library so
// the user apps and the admin console share one implementation. Re-exported to
// keep the admin-preferences feature API stable.
export { getPayloadTheme } from '@app/frontend-feature-shared-preferences';
