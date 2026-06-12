import { authApi, throwOnOpenApiErrorData } from "@app/api-client";
import { formValueToString } from "../../../shared/lib";
import type {
  AuthMePayload,
  AuthSessionPayload,
} from "../../../entities/profile";
import type { AuthFormInput, AuthRequest } from "../model";

export async function fetchAuthMe(
  authClient: Pick<typeof authApi, "authControllerMe">,
  requestOptions: Parameters<typeof authApi.authControllerMe>[0],
): Promise<AuthMePayload | null> {
  try {
    return await throwOnOpenApiErrorData(
      authClient.authControllerMe(requestOptions),
    );
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
  authClient: Pick<
    typeof authApi,
    "authControllerLogin" | "authControllerRegister"
  >,
  requestOptions: Parameters<typeof authApi.authControllerLogin>[1],
  input: AuthFormInput,
  locale: AuthRequest["locale"],
): Promise<AuthSessionPayload> {
  const request = mapAuthFormInput(input, locale);

  const payload =
    request.mode === "login"
      ? await throwOnOpenApiErrorData(
          authClient.authControllerLogin(
            { email: request.email, password: request.password },
            requestOptions,
          ),
        )
      : await throwOnOpenApiErrorData(
          authClient.authControllerRegister(
            {
              displayName: request.displayName,
              email: request.email,
              locale: request.locale,
              password: request.password,
            },
            requestOptions,
          ),
        );

  return payload;
}

export const authMeQueryKey = authApi.getAuthControllerMeQueryKey;
