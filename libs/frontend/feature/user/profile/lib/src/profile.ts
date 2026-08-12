import { getApiErrorDisplayMessage } from '@app/frontend-api-support';
import type { UserProfilePayload } from '@app/frontend-feature-shared-preferences';

// The auth-session preference primitives (payload readers + payload/patch types)
// now live in the shared session-preferences library so the admin console can
// consume them too. They are re-exported here to keep this user-profile
// boundary's public API stable for existing importers.
export { getPayloadLocale, getPayloadTheme, readAuthPayloadField } from '@app/frontend-feature-shared-preferences';
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
  // `payload` is the seam: a product reads a field this union does not model (say `emailVerified`)
  // with readAuthPayloadField instead of widening the state, the reader and this library together.
  | { status: 'ready'; email?: string; subject: string; payload?: UserProfilePayload }
  | { status: 'forbidden'; reason: string };

// An options object rather than positional arguments: the inputs grow whenever a screen needs one
// more signal, and each addition used to break every caller and spec across three libraries.
export interface ProfileStateInput {
  readonly loading: boolean;
  readonly profile?: UserProfilePayload;
  readonly profileRequestFailedMessage: string;
  readonly profileUnknownMessage: string;
  readonly error?: unknown;
}

export const getProfileState = ({
  loading,
  profile,
  profileRequestFailedMessage,
  profileUnknownMessage,
  error,
}: ProfileStateInput): ProfileState => {
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
    payload: profile,
  };
};
