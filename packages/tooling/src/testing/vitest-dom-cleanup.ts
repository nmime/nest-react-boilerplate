import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * Testing Library installs its auto-cleanup hook only when Vitest `globals` are enabled, and
 * every config in this workspace sets `globals: false`. Without this setup file, rendered trees
 * accumulate in the document across tests in the same file, so `getByRole`/`getByText` can match
 * a node left over from an earlier test and the suite becomes order-dependent.
 *
 * Registering cleanup here rather than per spec means new specs inherit it. Specs that already
 * call `cleanup()` themselves are unaffected — a second call is a no-op.
 */
afterEach(() => {
  cleanup();
});
