import type { supportedLocales } from '@app/backend-common-i18n';
import type { AuthenticatedPrincipal, AuthSessionView } from '@app/backend-feature-auth-shared';

export interface UserActionTokenPayload {
  issued: boolean;
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
