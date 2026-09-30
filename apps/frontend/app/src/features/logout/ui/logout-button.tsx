import { observer, useAuthShellStore, type TranslationKey, type TranslationParams } from '@app/frontend-runtime';
import { UiButton, UiToast } from '../../../shared/ui';
import { getApiErrorDisplayMessage } from '@app/frontend-api-support';
import { useLogout } from '@app/frontend-feature-user-logout';

export interface LogoutButtonProps {
  navigate?: (to: string, options?: { replace?: boolean }) => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
  variant?: 'primary' | 'secondary';
}

/**
 * User-facing sign-out control. Renders only for an authenticated session and
 * drives the observable {@link useLogout} flow: revoke the server session,
 * clear the shell store, drop cached server state, and route to the auth page.
 */
export const LogoutButton = observer(function LogoutButton({
  navigate,
  t,
  variant = 'secondary',
}: Readonly<LogoutButtonProps>) {
  const authStore = useAuthShellStore();
  const { model, signOut } = useLogout({ navigate });

  if (!authStore.isAuthenticated && !model.mutation.isError && !model.isPending) {
    return null;
  }

  return (
    <>
      {model.mutation.isError ? (
        <UiToast
          tone="warning"
          message={getApiErrorDisplayMessage(model.mutation.error, t('errors.internal-server-error.detail'))}
        />
      ) : null}
      <UiButton
        isLoading={model.isPending}
        loadingLabel={t('user.action.signingOut')}
        onClick={signOut}
        type="button"
        variant={variant}
      >
        {t('user.action.signOut')}
      </UiButton>
    </>
  );
});
