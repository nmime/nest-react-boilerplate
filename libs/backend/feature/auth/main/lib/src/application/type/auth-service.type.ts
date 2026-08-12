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

export interface UserActionTokenInput {
  tenantId?: string | null;
  email: string;
}

export interface UserActionTokenConfirmInput {
  tenantId?: string | null;
  token: string;
}

export interface PasswordResetConfirmInput extends UserActionTokenConfirmInput {
  password: string;
}
