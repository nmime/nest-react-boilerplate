import type { AuthenticatedPrincipal } from '@app/backend-feature-auth-shared';

export const resolveTenantId = (principal: AuthenticatedPrincipal): string => principal.tenantId;
