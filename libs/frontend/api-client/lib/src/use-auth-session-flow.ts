import { useCallback, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "./auth-client";
import type {
  RegisterDto,
  LoginDto,
  TelegramWebLoginDto,
  TelegramTmaDto,
  TelegramBotLinkDto,
  DiscordAuthorizationRequestDto,
  LinkTokenDto,
  UpdateLocaleDto,
  UpdatePreferencesDto,
  AuthSessionViewDto,
  AuthenticatedPrincipalDto,
  MePayloadDto,
  UpdatePreferencesDto as UpdatePreferencesDtoType,
} from "./auth";

const { useSession, signIn, signOut, signUp } = authClient;

// ─── Session Hook ───────────────────────────────────────────────────────────

export interface UseAuthSessionFlowReturn {
  session: AuthSessionViewDto | null;
  user: MePayloadDto["user"] | null;
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
    if (!sessionData) return null;
    return sessionData as unknown as AuthSessionViewDto;
  }, [sessionData]);

  const principal = useMemo(() => {
    if (!session) return null;
    return {
      subject: session.user.id,
      tenantId: session.user.tenantId,
      email: session.user.email,
      displayName: session.user.displayName,
      locale: session.user.locale,
      theme: session.user.theme,
      roles: session.user.roles || [],
      permissions: session.user.permissions || [],
    } as AuthenticatedPrincipalDto;
  }, [session]);

  const user = useMemo(
    () => (session ? session.user : null),
    [session],
  );

  const roles = useMemo(
    () => session?.user?.roles || [],
    [session],
  );

  const permissions = useMemo(
    () => session?.user?.permissions || [],
    [session],
  );

  const isAdmin = useMemo(
    () => roles.includes("admin"),
    [roles],
  );

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
      if (result.error) throw new Error(result.error.message);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/auth/get-session"] });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: RegisterDto) => {
      const result = await signUp.email({
        name: data.displayName || "",
        email: data.email,
        password: data.password,
        fetchOptions: {
          body: {
            tenantId: data.tenantId,
            locale: data.locale,
          },
        },
      });
      if (result.error) throw new Error(result.error.message);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["api/auth/get-session"] });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const result = await signOut();
      if (result.error) throw new Error(result.error.message);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["api/auth/get-session"] });
    },
  });

  // ── Custom mutations ─────────────────────────────────────────────────────

  const updateLocale = useCallback(
    async (data: UpdateLocaleDto) => {
      const res = await fetch("/auth/me/locale", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update locale");
      const result = await res.json();
      await queryClient.invalidateQueries({ queryKey: ["api/auth/get-session"] });
      return result.data;
    },
    [queryClient],
  );

  const updatePreferences = useCallback(
    async (data: UpdatePreferencesDtoType) => {
      const res = await fetch("/auth/me/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update preferences");
      const result = await res.json();
      await queryClient.invalidateQueries({ queryKey: ["api/auth/get-session"] });
      return result.data;
    },
    [queryClient],
  );

  const refreshSession = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["api/auth/get-session"] });
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
    login: loginMutation.mutateAsync,
    register: registerMutation.mutateAsync,
    logout: logoutMutation.mutateAsync,
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
    async (data?: DiscordAuthorizationRequestDto) => {
      const res = await fetch("/auth/discord/authorization-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data || {}),
      });
      if (!res.ok) throw new Error("Discord authorization failed");
      const result = await res.json();
      window.location.href = result.data.authorizationUrl;
    },
    [],
  );

  const telegramWebLogin = useCallback(
    async (data: TelegramWebLoginDto) => {
      const res = await fetch("/auth/telegram/web-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Telegram web login failed");
      await queryClient.invalidateQueries({ queryKey: ["api/auth/get-session"] });
    },
    [queryClient],
  );

  const telegramTmaLogin = useCallback(
    async (data: TelegramTmaDto) => {
      const res = await fetch("/auth/telegram/tma", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Telegram TMA login failed");
      await queryClient.invalidateQueries({ queryKey: ["api/auth/get-session"] });
    },
    [queryClient],
  );

  const telegramBotLink = useCallback(
    async (data: TelegramBotLinkDto) => {
      const res = await fetch("/auth/telegram/bot-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Telegram bot link failed");
    },
    [],
  );

  const createLinkToken = useCallback(
    async (data: LinkTokenDto) => {
      const res = await fetch("/auth/link-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Link token creation failed");
      return res.json();
    },
    [],
  );

  const unlinkIdentity = useCallback(
    async (identityId: string) => {
      const res = await fetch(`/auth/provider-identities/${identityId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Unlink failed");
      await queryClient.invalidateQueries({ queryKey: ["api/auth/get-session"] });
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
      await fetch("/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["api/auth/get-session"] });
      window.location.href = "/";
    },
  });

  return {
    signOut: signOutMutation.mutateAsync,
    isLoading: signOutMutation.isPending,
    error: signOutMutation.error,
  };
}
