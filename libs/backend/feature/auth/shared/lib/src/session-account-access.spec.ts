// @requirements REQ-AUTH-SESSION-002 REQ-AUTH-CREDENTIAL-003
import { InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { err, ok } from 'neverthrow';
import { describe, expect, it } from 'vitest';
import { requireActiveSessionAccount } from './session-account-access';

const account = { status: 'active' as const, credentialRevision: 2 };

describe('requireActiveSessionAccount', () => {
  it('returns the account a live session is entitled to', () => {
    expect(requireActiveSessionAccount({ credentialRevision: 2 }, ok(account))).toBe(account);
  });

  it('fails closed when the account cannot be loaded at all', () => {
    expect(() => requireActiveSessionAccount({}, err({ code: 'repository_error' }))).toThrow(
      InternalServerErrorException,
    );
  });

  it('refuses a session whose account is gone or no longer active', () => {
    expect(() => requireActiveSessionAccount({}, ok(null))).toThrow(UnauthorizedException);
    expect(() => requireActiveSessionAccount({}, ok({ status: 'disabled' }))).toThrow(UnauthorizedException);
    expect(() => requireActiveSessionAccount({}, ok({ status: 'invited' }))).toThrow(UnauthorizedException);
  });

  it('refuses a session stamped with a superseded credential epoch', () => {
    expect(() => requireActiveSessionAccount({ credentialRevision: 1 }, ok(account))).toThrow(UnauthorizedException);
  });

  // Sessions and accounts that predate the epoch carry no revision at all, and both sides read as
  // zero -- the column default -- so adopting this check strands nobody who was already signed in.
  it('treats an absent epoch on either side as the initial one', () => {
    const initial = { status: 'active' as const };

    expect(requireActiveSessionAccount({}, ok(initial))).toBe(initial);
    expect(requireActiveSessionAccount({ credentialRevision: 0 }, ok(initial))).toBe(initial);
    expect(() => requireActiveSessionAccount({ credentialRevision: 1 }, ok(initial))).toThrow(UnauthorizedException);
  });
});
