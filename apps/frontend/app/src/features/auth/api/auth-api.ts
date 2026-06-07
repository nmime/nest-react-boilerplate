import { apiFetch } from "@app/api-client/support";
import { getAuthApiBaseUrl } from "../../../shared/config/frontend-env";
import { formValueToString } from "../../../shared/lib/form";
import type {
  AuthMePayload,
  AuthSessionPayload,
} from "../../../entities/profile";
import type { AuthFormInput, AuthRequest } from "../model";

interface ApiEnvelope<TData> {
  data?: TData;
}

const unwrapData = <TData>(payload: TData | ApiEnvelope<TData>): TData =>
  payload && typeof payload === "object" && "data" in payload
    ? ((payload as ApiEnvelope<TData>).data as TData)
    : (payload as TData);

export async function fetchAuthMe(
  authToken: string,
): Promise<AuthMePayload | null> {
  try {
    const payload = await apiFetch<AuthMePayload | ApiEnvelope<AuthMePayload>>(
      "/auth/me",
      { authToken, baseUrl: getAuthApiBaseUrl() },
    );
    return unwrapData(payload) ?? null;
  } catch {
    return null;
  }
}

const mapAuthFormInput = (
  input: AuthFormInput,
  locale: AuthRequest["locale"],
): AuthRequest => ({
  displayName: formValueToString(input.displayName) || undefined,
  email: formValueToString(input.email),
  locale,
  mode: input.mode,
  password: formValueToString(input.password),
});

export async function createAuthSession(
  input: AuthFormInput,
  locale: AuthRequest["locale"],
): Promise<AuthSessionPayload> {
  const request = mapAuthFormInput(input, locale);

  const payload = await apiFetch<
    AuthSessionPayload | ApiEnvelope<AuthSessionPayload>
  >(request.mode === "login" ? "/auth/login" : "/auth/register", {
    baseUrl: getAuthApiBaseUrl(),
    json:
      request.mode === "login"
        ? {
            email: request.email,
            password: request.password,
          }
        : {
            displayName: request.displayName,
            email: request.email,
            locale: request.locale,
            password: request.password,
          },
    method: "POST",
  });

  return unwrapData(payload);
}

export const authMeQueryKey = () => ["get", "/auth/me"] as const;
