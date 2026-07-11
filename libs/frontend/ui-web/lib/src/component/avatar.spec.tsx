import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Avatar, computeInitials, UiAvatar } from './avatar';

describe('computeInitials', () => {
  it('returns single char for one-word name', () => {
    expect(computeInitials('Alice')).toBe('A');
  });

  it('returns first+last initials for two-word name', () => {
    expect(computeInitials('Alice B')).toBe('AB');
  });

  it('returns first+last initials for multi-word name', () => {
    expect(computeInitials('Ada Mary Lovelace')).toBe('AL');
  });

  it('returns ? for empty string', () => {
    expect(computeInitials('')).toBe('?');
  });

  it('returns ? for undefined', () => {
    expect(computeInitials(undefined)).toBe('?');
  });

  it('handles whitespace-only input', () => {
    expect(computeInitials('   ')).toBe('?');
  });

  it('handles mixed case', () => {
    expect(computeInitials('alice b')).toBe('AB');
  });
});

describe('Avatar (rendering)', () => {
  it('renders initials fallback when no src', () => {
    render(<Avatar name="Alice B" />);
    const el = screen.getByRole('img', { name: /avatar for alice b/i });
    expect(el).toBeTruthy();
    expect(el.textContent).toBe('AB');
  });

  it('renders img when src is provided', () => {
    render(<Avatar src="https://example.com/avatar.png" name="Alice" />);
    const img = screen.getByRole('img', { name: 'Avatar for Alice' });
    expect(img.getAttribute('src')).toBe('https://example.com/avatar.png');
  });

  it('uses custom alt when provided', () => {
    render(<Avatar src="https://example.com/a.png" name="Bob" alt="Bob's avatar" />);
    const img = screen.getByRole('img', { name: "Bob's avatar" });
    expect(img).toBeTruthy();
  });

  it('renders with ? fallback for empty name', () => {
    const { container } = render(<Avatar name="" />);
    const el = container.querySelector('[data-avatar-initials]');
    expect(el).toBeTruthy();
    expect(el?.textContent).toBe('?');
  });

  it('UiAvatar is the same component as Avatar', () => {
    expect(UiAvatar).toBe(Avatar);
  });

  it('renders correct size dimensions (initials)', () => {
    const { container } = render(<Avatar name="Test" size={48} />);
    const el = container.querySelector('[data-avatar-initials]');
    if (!(el instanceof HTMLElement)) {
      throw new Error('Expected initials avatar element.');
    }
    const computed = window.getComputedStyle(el);
    expect(computed.width).toBe('48px');
    expect(computed.height).toBe('48px');
  });

  it('renders correct size dimensions (img)', () => {
    const { container } = render(<Avatar src="https://example.com/a.png" name="Test" size={48} />);
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('width')).toBe('48');
    expect(img?.getAttribute('height')).toBe('48');
  });

  it('renders with correct size class', () => {
    const { container } = render(<Avatar name="XS" size={16} />);
    const el = container.querySelector('[data-avatar-initials]');
    expect(el?.className).toContain('avatar--xs');
  });

  it('has accessible aria-label', () => {
    render(<Avatar name="John Doe" />);
    const el = screen.getByRole('img', { name: 'Avatar for John Doe' });
    expect(el.getAttribute('aria-label')).toBe('Avatar for John Doe');
  });

  it('falls back to initials when img fires onError', () => {
    const { container } = render(<Avatar src="https://example.com/broken.png" name="Fail User" />);
    const img = container.querySelector('img');
    if (!(img instanceof HTMLImageElement)) {
      throw new Error('Expected avatar image element.');
    }
    fireEvent.error(img);
    const fallback = container.querySelector('[data-avatar-initials]');
    expect(fallback?.textContent).toBe('FU');
  });
});
