// @requirements REQ-FRONTEND-SHELL-004
import { describe, expect, it } from 'vitest';

import { formValueToString, formTextField } from './form-values';

describe('formValueToString', () => {
  it('keeps string entries as they are', () => {
    expect(formValueToString('ada@example.com')).toBe('ada@example.com');
  });

  it('collapses missing entries to an empty string', () => {
    expect(formValueToString(null)).toBe('');
    expect(formValueToString(undefined)).toBe('');
  });

  it('collapses file entries to an empty string instead of lying about their type', () => {
    expect(formValueToString(new File(['x'], 'avatar.png'))).toBe('');
  });
});

describe('formTextField', () => {
  it('reads a named text field out of form data', () => {
    const form = new FormData();
    form.set('email', 'ada@example.com');

    expect(formTextField(form, 'email')).toBe('ada@example.com');
  });

  it('returns an empty string for an absent field', () => {
    expect(formTextField(new FormData(), 'email')).toBe('');
  });

  it('returns an empty string for a file field', () => {
    const form = new FormData();
    form.set('avatar', new File(['x'], 'avatar.png'));

    expect(formTextField(form, 'avatar')).toBe('');
  });
});
