// The RBAC claim normalizer now lives in the framework-neutral shared lib so the
// backend and frontend share one fail-closed implementation.
export { normalizeStringList } from '@app/common-authz';
