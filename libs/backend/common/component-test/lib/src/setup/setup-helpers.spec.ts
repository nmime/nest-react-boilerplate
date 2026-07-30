// @requirements REQ-RUNTIME-RECOVERY-002
import { describe, expect, it, vi } from 'vitest';
import { createTestLogger } from '../util/test-logger';
import { setupContainers, teardownContainers } from './setup-containers';
import { setupNock } from './setup-nock';

describe('component test setup helpers', () => {
  it('installs the shared container manager on globalThis', () => {
    delete (
      globalThis as typeof globalThis & {
        componentTestContainerManager?: unknown;
      }
    ).componentTestContainerManager;

    setupContainers();

    expect(
      (
        globalThis as typeof globalThis & {
          componentTestContainerManager?: unknown;
        }
      ).componentTestContainerManager,
    ).toBeDefined();
  });

  it('runs teardown through the shared manager', async () => {
    setupContainers();
    const stop = vi.fn(() => Promise.resolve());
    const globalWithManager: typeof globalThis & {
      componentTestContainerManager?: {
        register: (container: { stop: () => Promise<void> }) => void;
      };
    } = globalThis;
    globalWithManager.componentTestContainerManager?.register({ stop });

    await teardownContainers();

    expect(stop).toHaveBeenCalledOnce();
  });

  it('keeps the nock setup hook and quiet test logger available', () => {
    setupNock();

    const logger = createTestLogger('SpecContext');
    expect(logger).toBeDefined();
    expect(logger.warn).toEqual(expect.any(Function));
  });
});
