export interface RegisterUserInput {
  email: string;
  password: string;
  displayName?: string;
  locale?: string | null;
  theme?: string | null;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface UserActionTokenInput {
  email: string;
}

export interface UserActionTokenConfirmInput {
  token: string;
}

export interface PasswordResetConfirmInput extends UserActionTokenConfirmInput {
  password: string;
}
