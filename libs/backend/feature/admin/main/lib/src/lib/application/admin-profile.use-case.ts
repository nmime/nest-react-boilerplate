import type { AuthenticatedPrincipal } from "@app/backend/feature/auth/shared";
import {
  type AdminProfileView,
  toAdminProfileView,
} from "@app/backend/feature/admin/shared";

export interface AdminProfilePayload {
  principal: AuthenticatedPrincipal;
  profile: AdminProfileView;
}

export class GetAdminProfileUseCase {
  execute(principal: AuthenticatedPrincipal): AdminProfilePayload {
    return {
      principal,
      profile: toAdminProfileView(principal),
    };
  }
}
