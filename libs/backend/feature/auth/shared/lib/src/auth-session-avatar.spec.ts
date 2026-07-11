import { describe, expect, it } from 'vitest';
import type { Locale } from '@app/common-i18n';
import { toAuthenticatedUserView } from './auth-session.types';

describe('toAuthenticatedUserView with avatar fields', () => {
  const baseInput = {
    id: 'u1',
    tenantId: 't1',
    email: 'alice@example.com',
    displayName: 'Alice',
    locale: 'en' as Locale,
    theme: 'system',
    roles: ['user'],
    permissions: ['profile:read'],
  };

  it('includes avatarUrl when present', () => {
    const view = toAuthenticatedUserView({
      ...baseInput,
      avatarUrl: 'https://example.com/a.png',
    });
    expect(view.avatarUrl).toBe('https://example.com/a.png');
  });

  it('omits avatarUrl when null', () => {
    const view = toAuthenticatedUserView({
      ...baseInput,
      avatarUrl: null,
    });
    expect(view.avatarUrl).toBeUndefined();
  });

  it('includes avatarStatus when not none', () => {
    const view = toAuthenticatedUserView({
      ...baseInput,
      avatarUrl: 'https://example.com/a.png',
      avatarStatus: 'provider',
    });
    expect(view.avatarStatus).toBe('provider');
  });

  it('includes avatarStatus when manual', () => {
    const view = toAuthenticatedUserView({
      ...baseInput,
      avatarUrl: 'https://cdn.storage.com/u1.png',
      avatarStatus: 'manual',
    });
    expect(view.avatarStatus).toBe('manual');
  });

  it('omits avatarStatus when none', () => {
    const view = toAuthenticatedUserView({
      ...baseInput,
      avatarUrl: null,
      avatarStatus: 'none',
    });
    expect(view.avatarStatus).toBeUndefined();
  });

  it('handles deleted status', () => {
    const view = toAuthenticatedUserView({
      ...baseInput,
      avatarUrl: null,
      avatarStatus: 'deleted',
    });
    expect(view.avatarStatus).toBe('deleted');
  });

  it('handles undefined avatarUrl and avatarStatus', () => {
    const view = toAuthenticatedUserView(baseInput);
    expect(view.avatarUrl).toBeUndefined();
    expect(view.avatarStatus).toBeUndefined();
  });
});
