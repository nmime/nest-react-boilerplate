import type { Locale } from "@app/common/i18n";
import type { AuthenticatedPrincipal } from "@app/backend/feature/auth/shared";
import {
  GetCurrentUserProfileUseCase,
  type CurrentUserProfile,
} from "../application/get-current-user-profile.use-case";
import type { UserProfile } from "../domain/user-profile";

export interface UserProfileView extends Omit<UserProfile, "locale"> {
  locale?: Locale;
}

export interface UserProfilePayload {
  principal: AuthenticatedPrincipal;
  profile: UserProfileView;
}

export function toUserProfileView(
  principal: AuthenticatedPrincipal,
  useCase = new GetCurrentUserProfileUseCase(),
): UserProfileView {
  return toUserProfilePayload(principal, useCase).profile;
}

export function toUserProfilePayload(
  principal: AuthenticatedPrincipal,
  useCase = new GetCurrentUserProfileUseCase(),
): UserProfilePayload {
  const currentProfile = useCase.execute(principal);

  return {
    principal,
    profile: presentUserProfile(currentProfile.profile),
  };
}

export function presentUserProfile(profile: UserProfile): UserProfileView {
  return {
    ...profile,
    locale: profile.locale as Locale | undefined,
  };
}

export type { CurrentUserProfile };
