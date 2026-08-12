// @requirements REQ-AUTH-PROFILE-006
import { describe, expect, it, vi } from 'vitest';
import { fetchUserProfile, getProfileState, profileQueryKey } from './index';

const messages = { profileRequestFailedMessage: 'f', profileUnknownMessage: 'unknown' };

describe('getProfileState', () => {
  it('reports the loading state', () => {
    expect(getProfileState({ loading: true, ...messages })).toEqual({ status: 'loading' });
  });

  it('reports forbidden with the resolved message when an error is present', () => {
    const state = getProfileState({
      loading: false,
      profileRequestFailedMessage: 'Profile failed',
      profileUnknownMessage: 'unknown',
      error: new Error('boom'),
    });
    expect(state).toEqual({ status: 'forbidden', reason: expect.any(String) });
  });

  it('resolves the ready subject through the profile → principal → id → subject → fallback chain', () => {
    expect(getProfileState({ loading: false, profile: { profile: { email: 'a@example.com' } }, ...messages })).toEqual({
      status: 'ready',
      subject: 'a@example.com',
      email: 'a@example.com',
      payload: { profile: { email: 'a@example.com' } },
    });
    expect(
      getProfileState({ loading: false, profile: { principal: { email: 'p@example.com' } }, ...messages }),
    ).toMatchObject({
      status: 'ready',
      subject: 'p@example.com',
      email: 'p@example.com',
    });
    expect(getProfileState({ loading: false, profile: { profile: { id: 'id-1' } }, ...messages })).toMatchObject({
      status: 'ready',
      subject: 'id-1',
      email: undefined,
    });
    expect(
      getProfileState({ loading: false, profile: { principal: { subject: 'sub-1' } }, ...messages }),
    ).toMatchObject({
      status: 'ready',
      subject: 'sub-1',
      email: undefined,
    });
    expect(getProfileState({ loading: false, profile: {}, ...messages })).toMatchObject({
      status: 'ready',
      subject: 'unknown',
      email: undefined,
    });
    expect(getProfileState({ loading: false, ...messages })).toEqual({
      status: 'ready',
      subject: 'unknown',
      email: undefined,
      payload: undefined,
    });
  });

  it('carries the raw payload so a product can read a field this state does not model', () => {
    const profile = { profile: { email: 'a@example.com', emailVerified: true } };
    const state = getProfileState({ loading: false, profile, ...messages });

    expect(state.status === 'ready' && state.payload).toBe(profile);
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
