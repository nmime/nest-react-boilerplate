// @requirements REQ-RUNTIME-STORAGE-007
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { S3ConfigService } from './config';
import { AwsS3ObjectStorageClient, createAwsS3Client } from './s3.aws-client';

describe('createAwsS3Client', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('creates an AWS client from the canonical S3 environment contract', async () => {
    const client = createAwsS3Client(
      new S3ConfigService({
        endpoint: 'http://127.0.0.1:9000',
        region: 'us-east-1',
        accessKey: 'minioadmin',
        secretKey: 'minioadmin',
        forcePathStyle: true,
      }),
    );

    await expect(client.config.region()).resolves.toBe('us-east-1');
    if (!client.config.endpoint) {
      throw new Error('Expected the configured S3 endpoint provider.');
    }
    await expect(client.config.endpoint()).resolves.toMatchObject({ hostname: '127.0.0.1', port: 9000 });
    expect(client.config.forcePathStyle).toBe(true);
    client.destroy();
  });

  it('rejects half-configured static credentials', () => {
    vi.stubEnv('S3_SECRET_KEY', '');
    expect(() =>
      createAwsS3Client(
        new S3ConfigService({
          accessKey: 'access-only',
        }),
      ),
    ).toThrow('S3_ACCESS_KEY and S3_SECRET_KEY must be configured together.');
  });

  it('uses the AWS defaults when endpoint and static credentials are omitted', () => {
    const client = createAwsS3Client(new S3ConfigService({ region: 'eu-west-1' }));

    expect(client.config.endpoint).toBeUndefined();
    expect(client.config.forcePathStyle).toBe(false);
    client.destroy();
  });
});

describe('AwsS3ObjectStorageClient', () => {
  it('maps put, get, delete, and paginated list operations to AWS commands', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        Body: { transformToByteArray: () => Promise.resolve(new Uint8Array([1, 2])) },
        ContentType: 'application/octet-stream',
        Metadata: { source: 'test' },
        LastModified: new Date('2026-01-01T00:00:00.000Z'),
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        Contents: [{ Key: 'a', Size: 1 }],
        IsTruncated: true,
        NextContinuationToken: 'next',
      })
      .mockResolvedValueOnce({
        Contents: [{}, { Key: 'b', Size: 2 }],
        IsTruncated: false,
      });
    const client = new AwsS3ObjectStorageClient({ send } as unknown as S3Client);

    await client.putObject({ bucket: 'media', key: 'a', body: 'value', contentType: 'text/plain' });
    await expect(client.getObject({ bucket: 'media', key: 'a' })).resolves.toMatchObject({
      key: 'a',
      body: new Uint8Array([1, 2]),
      contentType: 'application/octet-stream',
      metadata: { source: 'test' },
    });
    await client.deleteObject({ bucket: 'media', key: 'a' });
    await expect(client.listObjects({ bucket: 'media' })).resolves.toEqual([
      { key: 'a', updatedAt: undefined, size: 1 },
      { key: 'b', updatedAt: undefined, size: 2 },
    ]);

    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(PutObjectCommand);
    expect(send.mock.calls[1]?.[0]).toBeInstanceOf(GetObjectCommand);
    expect(send.mock.calls[2]?.[0]).toBeInstanceOf(DeleteObjectCommand);
    expect(send.mock.calls[3]?.[0]).toBeInstanceOf(ListObjectsV2Command);
    expect(send.mock.calls[4]?.[0]).toBeInstanceOf(ListObjectsV2Command);
    expect((send.mock.calls[4]?.[0] as ListObjectsV2Command).input.ContinuationToken).toBe('next');
  });

  it('returns null for an S3 missing-object response and rethrows other failures', async () => {
    const missingSend = vi.fn().mockRejectedValue({ name: 'NoSuchKey', $metadata: { httpStatusCode: 404 } });
    const failingSend = vi.fn().mockRejectedValue(new Error('network failed'));

    await expect(
      new AwsS3ObjectStorageClient({ send: missingSend } as unknown as S3Client).getObject({
        bucket: 'media',
        key: 'missing',
      }),
    ).resolves.toBeNull();
    await expect(
      new AwsS3ObjectStorageClient({ send: failingSend } as unknown as S3Client).getObject({
        bucket: 'media',
        key: 'broken',
      }),
    ).rejects.toThrow('network failed');
  });

  it('handles empty AWS responses, status-only misses, and non-object failures', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } })
      .mockRejectedValueOnce('network failed');
    const client = new AwsS3ObjectStorageClient({ send } as unknown as S3Client);

    await expect(client.getObject({ bucket: 'media', key: 'empty' })).resolves.toMatchObject({
      key: 'empty',
      body: new Uint8Array(),
    });
    await expect(client.listObjects({ bucket: 'media', prefix: 'empty/' })).resolves.toEqual([]);
    await expect(client.getObject({ bucket: 'media', key: 'missing' })).resolves.toBeNull();
    await expect(client.getObject({ bucket: 'media', key: 'broken' })).rejects.toBe('network failed');
  });
});
