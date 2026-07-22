import { describe, expect, it } from 'vitest';

import type { ApiEnvelope, AuthSessionContract } from './index';

describe('api contract aliases', () => {
  it('exposes generated envelope-compatible types', () => {
    const envelope: ApiEnvelope<Partial<AuthSessionContract>> = {
      data: { authProvider: 'password' },
    };

    expect(envelope.data?.authProvider).toBe('password');
  });
});
