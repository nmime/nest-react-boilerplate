import type { supportedLocales } from '@app/backend-common-i18n';
import type { AuthenticatedPrincipal, AuthSessionView } from '@app/backend-feature-auth-shared';

export interface UserActionTokenPayload {
  issued: boolean;
}

/**
 * Deliberately says nothing about the account behind the code. The confirm routes are public and
 * a caller only ever learns whether the code worked.
 */
export interface UserActionConfirmPayload {
  confirmed: true;
}

export interface MePayload {
  principal: AuthenticatedPrincipal;
  user: AuthSessionView['user'] | null;
}

export interface SupportedLocalesPayload {
  supportedLocales: typeof supportedLocales;
}

export interface LogoutPayload {
  loggedOut: true;
}
