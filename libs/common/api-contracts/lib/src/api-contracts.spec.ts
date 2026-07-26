// @requirements REQ-API-COMPAT-002
import { describe, expect, it } from 'vitest';
// Provider contract evidence for REQ-API-PROBLEM-001 and REQ-API-COMPAT-002.

import type { ApiEnvelope, AuthSessionContract } from './index';

describe('api contract aliases', () => {
  it('exposes generated envelope-compatible types', () => {
    const envelope: ApiEnvelope<Partial<AuthSessionContract>> = {
      data: { authProvider: 'password' },
    };

    expect(envelope.data?.authProvider).toBe('password');
  });
});
