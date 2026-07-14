import { describe, expect, it } from 'vitest';
import { ObjectStorageOperationFailedException } from './exception';
import { S3Service } from './s3.service';
import { InMemoryObjectStorageClient, type ObjectStorageClient } from './s3.storage';

describe('S3Service', () => {
  it('delegates put/get/list/delete to the underlying client', async () => {
    const service = new S3Service(new InMemoryObjectStorageClient());

    await service.putObject({ bucket: 'media', key: 'a', body: 'value' });

    await expect(service.getObject({ bucket: 'media', key: 'a' })).resolves.toMatchObject({ key: 'a' });
    await expect(service.listObjects({ bucket: 'media' })).resolves.toHaveLength(1);

    await service.deleteObject({ bucket: 'media', key: 'a' });

    await expect(service.getObject({ bucket: 'media', key: 'a' })).resolves.toBeNull();
    await expect(service.listObjects({ bucket: 'media' })).resolves.toHaveLength(0);
  });

  it.each([
    ['putObject', (service: S3Service) => service.putObject({ bucket: 'b', key: 'k', body: 'v' })],
    ['getObject', (service: S3Service) => service.getObject({ bucket: 'b', key: 'k' })],
    ['deleteObject', (service: S3Service) => service.deleteObject({ bucket: 'b', key: 'k' })],
    ['listObjects', (service: S3Service) => service.listObjects({ bucket: 'b' })],
  ] satisfies [string, (service: S3Service) => Promise<unknown>][])(
    'wraps a failing %s in ObjectStorageOperationFailedException',
    async (operation, invoke) => {
      const cause = new Error('boom');
      const failingClient: ObjectStorageClient = {
        putObject: () => Promise.reject(cause),
        getObject: () => Promise.reject(cause),
        deleteObject: () => Promise.reject(cause),
        listObjects: () => Promise.reject(cause),
      };
      const service = new S3Service(failingClient);

      const error = await invoke(service).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ObjectStorageOperationFailedException);
      expect((error as Error).message).toBe(`Object storage operation failed: ${operation}`);
      expect((error as ObjectStorageOperationFailedException).cause).toBe(cause);
    },
  );
});
