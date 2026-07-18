import { randomUUID } from 'node:crypto';
import { CreateBucketCommand, DeleteBucketCommand } from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';
import { S3ConfigService } from './config';
import { AwsS3ObjectStorageClient, createAwsS3Client } from './s3.aws-client';

const integrationEnabled = process.env.S3_INTEGRATION_TEST === 'true';

describe.runIf(integrationEnabled)('AWS S3 adapter with a live S3-compatible server', () => {
  it('creates a bucket and round-trips an object through MinIO', async () => {
    const bucket = `nrb-adapter-smoke-${randomUUID()}`;
    const key = 'smoke/ready.txt';
    const sdk = createAwsS3Client(new S3ConfigService());
    const storage = new AwsS3ObjectStorageClient(sdk);
    let bucketCreated = false;

    try {
      await sdk.send(new CreateBucketCommand({ Bucket: bucket }));
      bucketCreated = true;
      await storage.putObject({
        bucket,
        key,
        body: 'ready',
        contentType: 'text/plain',
        metadata: { source: 'live-minio' },
      });

      const object = await storage.getObject({ bucket, key });
      expect(object).toMatchObject({
        key,
        contentType: 'text/plain',
        metadata: { source: 'live-minio' },
      });
      expect(Buffer.from(object?.body ?? []).toString('utf8')).toBe('ready');
      await expect(storage.listObjects({ bucket, prefix: 'smoke/' })).resolves.toEqual([
        expect.objectContaining({ key, size: 5 }),
      ]);

      await storage.deleteObject({ bucket, key });
      await expect(storage.getObject({ bucket, key })).resolves.toBeNull();
    } finally {
      if (bucketCreated) {
        await storage.deleteObject({ bucket, key }).catch(() => undefined);
        await sdk.send(new DeleteBucketCommand({ Bucket: bucket })).catch(() => undefined);
      }
      sdk.destroy();
    }
  });
});
