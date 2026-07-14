import { describe, expect, it, vi } from 'vitest';
import { createMock, createRepositoryMock, createTestingLogger, deferred } from './mock';

describe('createTestingLogger', () => {
  it('exposes every LoggerService method as an independent spy', () => {
    const logger = createTestingLogger();

    logger.log('a');
    logger.warn('b');
    logger.error('c');
    logger.debug?.('d');
    logger.verbose?.('e');

    expect(vi.isMockFunction(logger['log'])).toBe(true);
    expect(logger['log']).toHaveBeenCalledWith('a');
    expect(logger['warn']).toHaveBeenCalledWith('b');
    expect(logger['error']).toHaveBeenCalledWith('c');
    expect(logger['debug']).toHaveBeenCalledWith('d');
    expect(logger['verbose']).toHaveBeenCalledWith('e');
  });
});

describe('createMock', () => {
  it('returns an empty object when no overrides are provided', () => {
    expect(createMock<{ id: string }>()).toEqual({});
  });

  it('returns the supplied overrides typed as the target', () => {
    const service = createMock<{ compute: () => number }>({
      compute: () => 42,
    });

    expect(service.compute()).toBe(42);
  });
});

describe('createRepositoryMock', () => {
  it('returns a fresh empty object to populate with method spies', () => {
    const repository = createRepositoryMock<{ find: () => number }>();

    expect(repository).toEqual({});

    repository.find = vi.fn<() => number>().mockReturnValue(7);
    expect(repository.find()).toBe(7);
  });
});

describe('deferred', () => {
  it('resolves the promise through the exposed resolve callback', async () => {
    const controller = deferred<string>();

    controller.resolve('done');

    await expect(controller.promise).resolves.toBe('done');
  });

  it('rejects the promise through the exposed reject callback', async () => {
    const controller = deferred<string>();

    controller.reject(new Error('boom'));

    await expect(controller.promise).rejects.toThrow('boom');
  });
});
