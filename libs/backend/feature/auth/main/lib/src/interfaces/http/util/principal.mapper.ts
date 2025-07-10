import {
  isLanguage,
  type AuthenticatedPrincipal,
  type AuthSessionView,
  type Language,
} from '@app/backend-feature-auth-shared';

export function principalFromUserView(
  principal: AuthenticatedPrincipal,
  user: AuthSessionView['user'],
): AuthenticatedPrincipal {
  return {
    ...principal,
    subject: user.id,
    tenantId: user.tenantId,
    email: user.email ?? undefined,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl ?? undefined,
    locale: normalizePrincipalLocale(user.locale),
    theme: user.theme,
    roles: user.roles,
    permissions: user.permissions,
  };
}

function normalizePrincipalLocale(locale: AuthSessionView['user']['locale']): Language | undefined {
  return locale && isLanguage(locale) ? locale : undefined;
}
