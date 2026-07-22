import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '@app/frontend-api-client';
import { FrontendI18nProvider, FrontendStateProvider } from '@app/frontend-runtime';
import { adminFrontendTranslations } from '@app/frontend-feature-admin-i18n';
import { createAdminAccess } from '../../entities/admin-session';
import { FeatureFlagsPage, valueTypeFor } from './feature-flags-page';

const ok = <T,>(data: T) => ({
  data,
  error: undefined,
  response: new Response(null, { status: 200 }),
});

const renderPage = (permissions: string[]) =>
  render(
    <FrontendStateProvider>
      <FrontendI18nProvider translations={adminFrontendTranslations}>
        <QueryClientProvider client={new QueryClient()}>
          <FeatureFlagsPage access={createAdminAccess({ permissions, roles: ['operations'], subject: 'admin-id' })} />
        </QueryClientProvider>
      </FrontendI18nProvider>
    </FrontendStateProvider>,
  );

describe('FeatureFlagsPage', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it.each([
    [true, 'boolean'],
    [42, 'number'],
    ['enabled', 'string'],
    [{ nested: true }, 'string'],
  ] as const)('maps %j to the %s editor', (value, expected) => {
    expect(valueTypeFor(value)).toBe(expected);
  });

  it('creates a tenant feature flag through the audited API', async () => {
    vi.spyOn(adminApi, 'adminFeatureFlagsControllerList').mockResolvedValue(ok({ items: [] }));
    const upsert = vi.spyOn(adminApi, 'adminFeatureFlagsControllerUpsert').mockResolvedValue(
      ok({
        createdAt: '2026-07-22T00:00:00.000Z',
        description: 'New checkout',
        enabled: true,
        id: '00000000-0000-0000-0000-000000000100',
        key: 'checkout.newflow',
        updatedAt: '2026-07-22T00:00:00.000Z',
        value: true,
      }),
    );

    renderPage(['admin:feature-flags:read', 'admin:feature-flags:write']);
    expect(await screen.findByText('No feature flags')).toBeTruthy();

    fireEvent.change(screen.getByRole('textbox', { name: 'Feature flag key' }), {
      target: { value: 'checkout.newflow' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), {
      target: { value: 'New checkout' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save feature flag' }));

    await waitFor(() => {
      expect(upsert).toHaveBeenCalledWith(
        'checkout.newflow',
        { description: 'New checkout', enabled: true, value: true },
        undefined,
      );
    });
    expect(await screen.findByText('Feature flag saved and audited.')).toBeTruthy();
  });

  it('keeps mutation controls out of a read-only capability', async () => {
    vi.spyOn(adminApi, 'adminFeatureFlagsControllerList').mockResolvedValue(ok({ items: [] }));
    renderPage(['admin:feature-flags:read']);

    expect(await screen.findByText('No feature flags')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save feature flag' })).toBeFalsy();
  });
});
