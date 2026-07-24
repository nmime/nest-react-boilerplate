import { getApiErrorDisplayMessage } from '@app/frontend-api-support';
import type { UserProfilePayload } from '@app/frontend-feature-shared-preferences';

// The auth-session preference primitives (payload readers + payload/patch types)
// now live in the shared session-preferences library so the admin console can
// consume them too. They are re-exported here to keep this user-profile
// boundary's public API stable for existing importers.
export { getPayloadLocale, getPayloadTheme } from '@app/frontend-feature-shared-preferences';
export type {
  AuthPrincipalPayload,
  AuthUserPayload,
  AuthMePayload,
  AuthSessionPayload,
  AuthPreferencesPayload,
  UserProfilePayload,
  LocalePayload,
  UserPreferencePatch,
} from '@app/frontend-feature-shared-preferences';

export type ProfileState =
  | { status: 'loading' }
  | { status: 'unauthenticated'; reason: string }
  | { status: 'ready'; email?: string; subject: string }
  | { status: 'forbidden'; reason: string };

export const getProfileState = (
  loading: boolean,
  profile: UserProfilePayload | undefined,
  profileRequestFailedMessage: string,
  profileUnknownMessage: string,
  error?: unknown,
): ProfileState => {
  if (loading) {
    return { status: 'loading' };
  }
  if (error) {
    return {
      status: 'forbidden',
      reason: getApiErrorDisplayMessage(error, profileRequestFailedMessage),
    };
  }

  return {
    status: 'ready',
    subject:
      profile?.profile?.email ??
      profile?.principal?.email ??
      profile?.profile?.id ??
      profile?.principal?.subject ??
      profileUnknownMessage,
    email: profile?.profile?.email ?? profile?.principal?.email,
  };
};
