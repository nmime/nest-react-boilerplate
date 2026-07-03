import type { Locale } from "@app/frontend-runtime";

export enum AuthMode {
  Login = "login",
  Register = "register",
}

export interface AuthFormInput {
  displayName?: FormDataEntryValue | null;
  email: FormDataEntryValue | null;
  mode: AuthMode;
  password: FormDataEntryValue | null;
}

export interface AuthRequest {
  displayName?: string;
  email: string;
  locale: Locale;
  mode: AuthMode;
  password: string;
}
