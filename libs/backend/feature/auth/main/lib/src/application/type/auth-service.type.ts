export interface RegisterUserInput {
  tenantId?: string | null;
  email: string;
  password: string;
  displayName?: string;
  locale?: string | null;
  theme?: string | null;
}

export interface LoginInput {
  tenantId?: string | null;
  email: string;
  password: string;
}

export interface RefreshSessionInput {
  tenantId?: string | null;
  refreshToken: string;
}

export interface UserActionTokenInput {
  tenantId?: string | null;
  email: string;
}
