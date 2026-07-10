import { useCallback, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authClient } from './auth-client';
import type {
  RegisterDto,
  LoginDto,
  TelegramWebLoginDto,
  TelegramTmaDto,
  TelegramBotLinkDto,
  DiscordAuthorizationRequestDto,
  LinkTokenDto,
  UpdateLocaleDto,
  UpdatePreferencesDto as UpdatePreferencesDtoType,
  AuthSessionViewDto,
  AuthenticatedPrincipalDto,
  MePayloadDto,
} from './auth';

const { useSession, signIn, signOut, signUp } = authClient;

// ─── Session Hook ───────────────────────────────────────────────────────────

export interface UseAuthSessionFlowReturn {
  session: AuthSessionViewDto | null;
  user: MePayloadDto['user'] | null;
  principal: AuthenticatedPrincipalDto | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  roles: string[];
  permissions: string[];

  login: (data: LoginDto) => Promise<void>;
  register: (data: RegisterDto) => Promise<void>;
  logout: () => Promise<void>;
  updateLocale: (data: UpdateLocaleDto) => Promise<void>;
  updatePreferences: (data: UpdatePreferencesDtoType) => Promise<void>;
  refreshSession: () => Promise<void>;
}

export function useAuthSessionFlow(): UseAuthSessionFlowReturn {
  const queryClient = useQueryClient();

  const { data: sessionData, isPending: isLoading } = useSession();
  const session = useMemo(() => {
    if (!sessionData) {
      return null;
    }
    return sessionData as unknown as AuthSessionViewDto;
  }, [sessionData]);

  const principal: AuthenticatedPrincipalDto | null = useMemo(() => {
    if (!session) {
      return null;
    }
    return {
      subject: session.user.id,
      tenantId: session.user.tenantId,
      email: session.user.email,
      displayName: session.user.displayName,
      locale: session.user.locale,
      theme: session.user.theme,
      roles: session.user.roles,
      permissions: session.user.permissions,
    };
  }, [session]);

  const user: MePayloadDto['user'] | null = useMemo(() => {
    if (!session) {
      return null;
    }
    return session.user;
  }, [session]);

  const roles: string[] = useMemo(() => {
    if (!session) {
      return [];
    }
    return session.user.roles;
  }, [session]);

  const permissions: string[] = useMemo(() => {
    if (!session) {
      return [];
    }
    return session.user.permissions;
  }, [session]);

  const isAdmin = useMemo(() => roles.includes('admin'), [roles]);

  const isAuthenticated = !!session;

  // ── Mutations ────────────────────────────────────────────────────────────

  const loginMutation = useMutation({
    mutationFn: async (data: LoginDto) => {
      const result = await signIn.email({
        email: data.email,
        password: data.password,
        fetchOptions: {
          body: {
            tenantId: data.tenantId,
          },
        },
      });
      if (result.error) {
        throw new Error(result.error.message);
      }
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['/api/auth/get-session'] });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: RegisterDto) => {
      const result = await signUp.email({
        name: data.displayName || '',
        email: data.email,
        password: data.password,
        fetchOptions: {
          body: {
            tenantId: data.tenantId,
            locale: data.locale,
          },
        },
      });
      if (result.error) {
        throw new Error(result.error.message);
      }
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['api/auth/get-session'] });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const result = await signOut();
      if (result.error) {
        throw new Error(result.error.message);
      }
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['api/auth/get-session'] });
    },
  });

  // ── Custom mutations ─────────────────────────────────────────────────────

  const updateLocale = useCallback(
    async (data: UpdateLocaleDto): Promise<void> => {
      const res = await fetch('/auth/me/locale', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        throw new Error('Failed to update locale');
      }
      await queryClient.invalidateQueries({ queryKey: ['api/auth/get-session'] });
    },
    [queryClient],
  );

  const updatePreferences = useCallback(
    async (data: UpdatePreferencesDtoType): Promise<void> => {
      const res = await fetch('/auth/me/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        throw new Error('Failed to update preferences');
      }
      await queryClient.invalidateQueries({ queryKey: ['api/auth/get-session'] });
    },
    [queryClient],
  );

  const refreshSession = useCallback(async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ['api/auth/get-session'] });
  }, [queryClient]);

  return {
    session,
    user,
    principal,
    isLoading,
    isAuthenticated,
    isAdmin,
    roles,
    permissions,
    login: async (data: LoginDto) => {
      await loginMutation.mutateAsync(data);
    },
    register: async (data: RegisterDto) => {
      await registerMutation.mutateAsync(data);
    },
    logout: async () => {
      await logoutMutation.mutateAsync();
    },
    updateLocale,
    updatePreferences,
    refreshSession,
  };
}

// ─── Social Auth Hook ───────────────────────────────────────────────────────

export interface UseSocialAuthReturn {
  discordAuthorize: (data?: DiscordAuthorizationRequestDto) => Promise<void>;
  telegramWebLogin: (data: TelegramWebLoginDto) => Promise<void>;
  telegramTmaLogin: (data: TelegramTmaDto) => Promise<void>;
  telegramBotLink: (data: TelegramBotLinkDto) => Promise<void>;
  createLinkToken: (data: LinkTokenDto) => Promise<void>;
  unlinkIdentity: (identityId: string) => Promise<void>;
}

export function useSocialAuth(): UseSocialAuthReturn {
  const queryClient = useQueryClient();

  const discordAuthorize = useCallback(
    async (data?: DiscordAuthorizationRequestDto): Promise<void> => {
      const res = await fetch('/auth/discord/authorization-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data || {}),
      });
      if (!res.ok) {
        throw new Error('Discord authorization failed');
      }
      const body = ((await res.json()) as { data: { authorizationUrl: string } }).data;
      window.location.href = body.authorizationUrl;
    },
    [],
  );

  const telegramWebLogin = useCallback(
    async (data: TelegramWebLoginDto): Promise<void> => {
      const res = await fetch('/auth/telegram/web-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        throw new Error('Telegram web login failed');
      }
      await queryClient.invalidateQueries({ queryKey: ['api/auth/get-session'] });
    },
    [queryClient],
  );

  const telegramTmaLogin = useCallback(
    async (data: TelegramTmaDto): Promise<void> => {
      const res = await fetch('/auth/telegram/tma', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        throw new Error('Telegram TMA login failed');
      }
      await queryClient.invalidateQueries({ queryKey: ['api/auth/get-session'] });
    },
    [queryClient],
  );

  const telegramBotLink = useCallback(
    async (data: TelegramBotLinkDto): Promise<void> => {
      const res = await fetch('/auth/telegram/bot-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        throw new Error('Telegram bot link failed');
      }
    },
    [],
  );

  const createLinkToken = useCallback(async (data: LinkTokenDto): Promise<void> => {
    const res = await fetch('/auth/link-tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      throw new Error('Link token creation failed');
    }
  }, []);

  const unlinkIdentity = useCallback(
    async (identityId: string): Promise<void> => {
      const res = await fetch(`/auth/provider-identities/${identityId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error('Unlink failed');
      }
      await queryClient.invalidateQueries({ queryKey: ['api/auth/get-session'] });
    },
    [queryClient],
  );

  return {
    discordAuthorize,
    telegramWebLogin,
    telegramTmaLogin,
    telegramBotLink,
    createLinkToken,
    unlinkIdentity,
  };
}

// ─── Sign Out Hook ──────────────────────────────────────────────────────────

export function useSignOut() {
  const queryClient = useQueryClient();

  const signOutMutation = useMutation({
    mutationFn: async () => {
      await fetch('/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['api/auth/get-session'] });
      window.location.href = '/';
    },
  });

  return {
    signOut: signOutMutation.mutateAsync,
    isLoading: signOutMutation.isPending,
    error: signOutMutation.error,
  };
}
