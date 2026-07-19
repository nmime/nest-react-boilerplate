import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  ApiClientProvider,
  createApiClientRegistry,
  useAdminApiClient,
  useApiClientRegistry,
  useAuthApiClient,
  useUserApiClient,
  type generatedAuthApi,
} from './index';
import type { AuthSessionContract } from '@app/common-api-contracts';

type StableAuthContractImport = Omit<Partial<AuthSessionContract>, 'user'> &
  Omit<Partial<generatedAuthApi.components['schemas']['AuthSessionViewDto']>, 'user'> & {
    user?: Partial<generatedAuthApi.components['schemas']['AuthSessionViewDto']['user']>;
  };

const Probe = () => {
  const adminClient = useAdminApiClient();
  const authClient = useAuthApiClient();
  const userClient = useUserApiClient();

  return (
    <output data-testid="registry">
      {JSON.stringify({
        adminBaseUrl: adminClient.requestOptions.baseUrl,
        authBaseUrl: authClient.requestOptions.baseUrl,
        authToken: authClient.requestOptions.authToken,
        userBaseUrl: userClient.requestOptions.baseUrl,
      })}
    </output>
  );
};

describe('api client registry', () => {
  it('creates injected auth, user, and admin clients with normalized runtime options', () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const registry = createApiClientRegistry({
      authToken: ' token-123 ',
      baseUrls: {
        admin: 'https://admin.example.test',
        auth: 'https://auth.example.test',
        user: 'https://user.example.test',
      },
      fetchImpl,
      headers: { 'x-app': 'frontend' },
    });

    expect(registry.auth.api.getAuthControllerMeQueryKey()).toEqual(['get', '/auth/me']);
    expect(registry.auth.requestOptions).toMatchObject({
      authToken: 'token-123',
      baseUrl: 'https://auth.example.test',
      fetchImpl,
      headers: { 'x-app': 'frontend' },
    });
    expect(registry.user.requestOptions.baseUrl).toBe('https://user.example.test');
    expect(registry.admin.requestOptions.baseUrl).toBe('https://admin.example.test');
  });

  it('provides generated clients through React context and loads problem presentation overrides', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              items: [
                {
                  ruleId: 'user-app-api:PATCH:/profile:409:resource-conflict',
                  display: 'silent',
                  revision: 2,
                  severity: 'info',
                },
              ],
            },
          }),
          { headers: { 'content-type': 'application/json' }, status: 200 },
        ),
      ),
    );
    render(
      <ApiClientProvider
        authToken=" bearer-token "
        baseUrls={{
          admin: '/admin-api',
          auth: '/auth-api',
          user: '/user-api',
        }}
        fetchImpl={fetchImpl}
        loadProblemPresentationOverrides
      >
        <Probe />
      </ApiClientProvider>,
    );

    expect(screen.getByTestId('registry').textContent).toBe(
      JSON.stringify({
        adminBaseUrl: '/admin-api',
        authBaseUrl: '/auth-api',
        authToken: 'bearer-token',
        userBaseUrl: '/user-api',
      }),
    );
    await waitFor(() => {
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
    expect((fetchImpl.mock.calls[0]?.[0] as Request).url).toBe(
      `${globalThis.location.origin}/auth-api/auth/problem-presentations`,
    );
  });

  it('normalizes absent and blank auth tokens to undefined', () => {
    const baseUrls = {
      admin: 'https://admin.example.test',
      auth: 'https://auth.example.test',
      user: 'https://user.example.test',
    };

    const withoutToken = createApiClientRegistry({ baseUrls });
    expect(withoutToken.auth.requestOptions.authToken).toBeUndefined();

    const withBlankToken = createApiClientRegistry({
      authToken: '   ',
      baseUrls,
    });
    expect(withBlankToken.auth.requestOptions.authToken).toBeUndefined();

    const withNullToken = createApiClientRegistry({
      authToken: null,
      baseUrls,
    });
    expect(withNullToken.auth.requestOptions.authToken).toBeUndefined();
  });

  it('throws when a registry hook is used outside an ApiClientRegistryProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      expect(() => renderHook(() => useApiClientRegistry())).toThrow(
        'useApiClientRegistry must be used within ApiClientRegistryProvider.',
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it('keeps stable public aliases usable for generated contracts and clients', () => {
    const session = {
      accessToken: 'access-token',
      expiresIn: 3600,
      tokenType: 'Bearer',
      user: { email: 'ada@example.com', id: 'user-1' },
    } satisfies Partial<StableAuthContractImport>;

    expect(session.tokenType).toBe('Bearer');
  });
});
