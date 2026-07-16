import type { TranslationKey, TranslationParams } from '@app/frontend-runtime';
import type { SubmitEvent, ReactNode } from 'react';
import { AuthCards, type AuthMode } from '../../../features/auth';

export interface AuthPanelProps {
  isLoginPending: boolean;
  isRegisterPending: boolean;
  loadingLabel: string;
  onAuthSubmit: (mode: AuthMode, event: SubmitEvent<HTMLFormElement>) => void;
  children: ReactNode;
  t: (key: TranslationKey, params?: TranslationParams) => string;
  socialAuthSlot?: ReactNode;
}

export function AuthPanel({
  isLoginPending,
  isRegisterPending,
  loadingLabel,
  onAuthSubmit,
  children,
  t,
  socialAuthSlot,
}: Readonly<AuthPanelProps>) {
  return (
    <div className="user-auth__grid" id="auth">
      <AuthCards
        isLoginPending={isLoginPending}
        isRegisterPending={isRegisterPending}
        loadingLabel={loadingLabel}
        onSubmit={onAuthSubmit}
        t={t}
        socialAuthSlot={socialAuthSlot}
      />
      {children}
    </div>
  );
}
