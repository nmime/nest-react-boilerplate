import { describe, expect, it } from 'vitest';
import type { UserProfile } from '../domain';
import { presentUserProfile } from './profile-view.presenter';

const baseProfile: UserProfile = {
  id: 'user-id',
  roles: [],
  permissions: [],
};

describe('presentUserProfile', () => {
  it('passes supported locales through unchanged', () => {
    expect(presentUserProfile({ ...baseProfile, locale: 'ru' }).locale).toBe('ru');
  });

  it('normalizes an unsupported auth locale (zh) to undefined instead of leaking it', () => {
    expect(presentUserProfile({ ...baseProfile, locale: 'zh' }).locale).toBeUndefined();
  });

  it('normalizes region-qualified locales down to the supported base locale', () => {
    expect(presentUserProfile({ ...baseProfile, locale: 'en-US' }).locale).toBe('en');
  });

  it('leaves an absent locale undefined', () => {
    expect(presentUserProfile({ ...baseProfile }).locale).toBeUndefined();
  });
});
