import { profileQueryKey } from '@app/frontend-feature-user-profile';
import { useSessionPreferenceControls } from '@app/frontend-feature-shared-preferences';

export type { UserPreferenceControls } from '@app/frontend-feature-shared-preferences';

/**
 * Preference controls for the user web `app` and native `mobile` app: the shared
 * session hook wired to invalidate the user profile query after a write. The
 * admin console consumes the same shared hook with its own profile query key.
 */
export function useUserPreferenceControls() {
  return useSessionPreferenceControls({ invalidateQueryKeys: () => [profileQueryKey()] });
}
