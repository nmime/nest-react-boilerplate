import { throwOnOpenApiErrorData, type AuthApiClient } from '@app/frontend-api-client';

/**
 * Calls the user auth logout endpoint through the generated api-client wrapper
 * so the backend can revoke the server-side session. Endpoint paths and query
 * keys stay owned by `@app/frontend-api-client`.
 */
export const requestLogout = async (authClient: AuthApiClient): Promise<unknown> =>
  throwOnOpenApiErrorData(authClient.api.authControllerLogout(authClient.requestOptions));
