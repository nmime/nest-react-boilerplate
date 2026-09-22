// @requirements REQ-RUNTIME-STORAGE-007
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { S3ConfigService } from './config';
import { ObjectStorageOperationFailedException } from './exception';
import { S3Service } from './s3.service';
import { InMemoryObjectStorageClient, type ObjectStorageClient } from './s3.storage';

describe('S3Service', () => {
  const s3EnvKeys = ['S3_ACCESS_KEY', 'S3_BUCKET', 'S3_ENDPOINT', 'S3_FORCE_PATH_STYLE', 'S3_REGION', 'S3_SECRET_KEY'] as const;
  const savedS3Env = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const key of s3EnvKeys) {
      savedS3Env.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of s3EnvKeys) {
      const value = savedS3Env.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    savedS3Env.clear();
  });

  it('delegates put/get/list/delete to the underlying client', async () => {
    const service = new S3Service(new InMemoryObjectStorageClient(), new S3ConfigService({ bucket: 'media' }));

    await service.putObject({ key: 'a', body: 'value' });

    await expect(service.getObject({ key: 'a' })).resolves.toMatchObject({ key: 'a' });
    await expect(service.listObjects()).resolves.toHaveLength(1);

    await service.deleteObject({ key: 'a' });

    await expect(service.getObject({ key: 'a' })).resolves.toBeNull();
    await expect(service.listObjects()).resolves.toHaveLength(0);
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
      const service = new S3Service(failingClient, new S3ConfigService({ bucket: 'b' }));

      const error = await invoke(service).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ObjectStorageOperationFailedException);
      expect((error as Error).message).toBe(`Object storage operation failed: ${operation}`);
      expect((error as ObjectStorageOperationFailedException).cause).toBe(cause);
    },
  );

  it('wraps a missing default bucket as an operation failure', async () => {
    const service = new S3Service(new InMemoryObjectStorageClient(), new S3ConfigService());

    const error = await service.putObject({ key: 'a', body: 'value' }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ObjectStorageOperationFailedException);
    expect((error as ObjectStorageOperationFailedException).cause).toEqual(
      new Error('S3_BUCKET is required when an operation does not provide an explicit bucket.'),
    );
  });
});
