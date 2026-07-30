// @requirements REQ-AUTH-PROFILE-006
import { describe, expect, it, vi } from 'vitest';
import { fetchUserProfile, getProfileState, profileQueryKey } from './index';

describe('getProfileState', () => {
  it('reports the loading state', () => {
    expect(getProfileState(true, undefined, 'failed', 'unknown')).toEqual({ status: 'loading' });
  });

  it('reports forbidden with the resolved message when an error is present', () => {
    const state = getProfileState(false, undefined, 'Profile failed', 'unknown', new Error('boom'));
    expect(state).toEqual({ status: 'forbidden', reason: expect.any(String) });
  });

  it('resolves the ready subject through the profile → principal → id → subject → fallback chain', () => {
    expect(getProfileState(false, { profile: { email: 'a@example.com' } }, 'f', 'unknown')).toEqual({
      status: 'ready',
      subject: 'a@example.com',
      email: 'a@example.com',
    });
    expect(getProfileState(false, { principal: { email: 'p@example.com' } }, 'f', 'unknown')).toEqual({
      status: 'ready',
      subject: 'p@example.com',
      email: 'p@example.com',
    });
    expect(getProfileState(false, { profile: { id: 'id-1' } }, 'f', 'unknown')).toEqual({
      status: 'ready',
      subject: 'id-1',
      email: undefined,
    });
    expect(getProfileState(false, { principal: { subject: 'sub-1' } }, 'f', 'unknown')).toEqual({
      status: 'ready',
      subject: 'sub-1',
      email: undefined,
    });
    expect(getProfileState(false, {}, 'f', 'unknown-user')).toEqual({
      status: 'ready',
      subject: 'unknown-user',
      email: undefined,
    });
    expect(getProfileState(false, undefined, 'f', 'unknown-user')).toEqual({
      status: 'ready',
      subject: 'unknown-user',
      email: undefined,
    });
  });
});

describe('fetchUserProfile', () => {
  it('unwraps the profile controller envelope', async () => {
    const profile = { profile: { email: 'a@example.com' } };
    const profileControllerMe = vi.fn().mockResolvedValue({ data: { data: profile }, response: new Response(null) });

    await expect(fetchUserProfile({ profileControllerMe } as never, {})).resolves.toEqual(profile);
    expect(profileControllerMe).toHaveBeenCalledOnce();
  });

  it('exposes the profile query-key helper', () => {
    expect(typeof profileQueryKey).toBe('function');
  });
});
