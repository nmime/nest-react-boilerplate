import {
  createUserProfile,
  type UserProfile,
  type UserProfilePrincipal,
} from "../domain/user-profile";

export interface CurrentUserProfile {
  principal: UserProfilePrincipal;
  profile: UserProfile;
}

export class GetCurrentUserProfileUseCase {
  execute(principal: UserProfilePrincipal): CurrentUserProfile {
    return {
      principal,
      profile: createUserProfile(principal),
    };
  }
}
