import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppStore } from './app-store';

describe('AppStore host compatibility', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses a mobile breakpoint without DOM viewport APIs', () => {
    vi.stubGlobal('window', {});

    const store = new AppStore();

    expect(store.currentBreakpoint).toBe('mobile');
    expect(() => {
      store.dispose();
    }).not.toThrow();
  });

  it('subscribes and disposes only when browser event APIs are available', () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    vi.stubGlobal('window', {
      addEventListener,
      innerWidth: 800,
      removeEventListener,
    });

    const store = new AppStore();
    store.dispose();

    expect(store.currentBreakpoint).toBe('tablet');
    expect(addEventListener).toHaveBeenCalledWith('resize', expect.any(Function), { passive: true });
    expect(removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
  });
});
