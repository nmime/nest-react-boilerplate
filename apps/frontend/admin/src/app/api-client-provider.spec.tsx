import { useEffect } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAdminApiClient, useAuthApiClient } from '@app/frontend-api-client';
import { resetApiRuntimeForOnline } from '@app/frontend-api-support';
import App from '../App';

const Probe = () => {
  const adminClient = useAdminApiClient();
  const authClient = useAuthApiClient();

  return (
    <output data-testid="admin-api-client-runtime">
      {JSON.stringify({
        adminBaseUrl: adminClient.requestOptions.baseUrl,
        authBaseUrl: authClient.requestOptions.baseUrl,
        hasFetch: authClient.requestOptions.fetchImpl !== undefined,
      })}
    </output>
  );
};

const OfflineProbe = () => {
  const adminClient = useAdminApiClient();

  useEffect(() => {
    void adminClient.requestOptions.fetchImpl?.('https://api.example.test/admin/profile/me').catch(() => undefined);
  }, [adminClient.requestOptions]);

  return null;
};

const UnauthorizedProbe = () => {
  const adminClient = useAdminApiClient();

  useEffect(() => {
    void adminClient.requestOptions.fetchImpl?.('https://api.example.test/admin/profile/me');
  }, [adminClient.requestOptions]);

  return null;
};

describe('admin app API client provider wiring', () => {
  afterEach(() => {
    cleanup();
    resetApiRuntimeForOnline();
    vi.unstubAllGlobals();
  });
  it('injects public generated clients with configured admin/auth base URLs', () => {
    render(<App testChild={<Probe />} />);

    expect(screen.getByTestId('admin-api-client-runtime').textContent).toBe(
      JSON.stringify({
        adminBaseUrl: '',
        authBaseUrl: '',
        hasFetch: true,
      }),
    );
  });

  it('shows a route-safe offline runtime screen when API fetch fails offline', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new TypeError('network offline');
      }),
    );

    render(<App testChild={<OfflineProbe />} />);

    expect(await screen.findAllByText('You are offline')).not.toHaveLength(0);
    expect(screen.getAllByText(/stays on the current route/i)).not.toHaveLength(0);
  });

  it('prompts for authentication when an httpOnly cookie session expires', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ status: 401, title: 'Unauthorized', type: 'about:blank' }), {
            headers: { 'content-type': 'application/problem+json' },
            status: 401,
          }),
        ),
      ),
    );

    render(<App testChild={<UnauthorizedProbe />} />);

    expect(await screen.findByRole('dialog', { name: 'Authentication required' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Continue to sign in' }).getAttribute('href')).toBe('/admin');
  });
});
