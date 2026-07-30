// @requirements REQ-AUTH-ACCESS-001
import { describe, expect, it, vi } from 'vitest';
import { normalizeEmail } from './email-address';
import { hashPassword, verifyPassword } from './password.service';
import { InvalidAuthTenantIdError, parseDomainTenantId } from './tenant-id';

describe('auth domain services', () => {
  it('normalizes email addresses without framework dependencies', () => {
    expect(normalizeEmail(' USER@EXAMPLE.COM ')).toBe('user@example.com');
  });

  it('hashes and verifies password credentials', () => {
    const encoded = hashPassword('password123', 'fixed-salt');

    expect(verifyPassword('password123', encoded)).toBe(true);
    expect(verifyPassword('wrongpass', encoded)).toBe(false);
    expect(verifyPassword('password123', 'pbkdf2_sha256$$salt$digest')).toBe(false);
    const from = vi.spyOn(Buffer, 'from').mockImplementationOnce(() => {
      throw new Error('decode failed');
    });
    expect(verifyPassword('password123', 'pbkdf2_sha256$1$salt$digest')).toBe(false);
    from.mockRestore();
  });

  it('parses tenant ids and reports invalid tenants as domain errors', () => {
    expect(parseDomainTenantId('11111111-1111-4111-8111-111111111111')).toBe('11111111-1111-4111-8111-111111111111');
    expect(() => parseDomainTenantId('not valid')).toThrow(InvalidAuthTenantIdError);
  });
});
