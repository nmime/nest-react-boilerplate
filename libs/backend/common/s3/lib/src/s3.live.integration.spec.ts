// @requirements REQ-RUNTIME-STORAGE-007
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { CreateBucketCommand, DeleteBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { parse } from 'yaml';
import { S3ConfigService } from './config';
import { AwsS3ObjectStorageClient, createAwsS3Client } from './s3.aws-client';

const integrationEnabled = process.env.S3_INTEGRATION_TEST === 'true';

describe.runIf(integrationEnabled)('AWS S3 adapter with a live S3-compatible server', () => {
  let service:
    | {
        container: StartedTestContainer;
        url: string;
        adminUrl: string;
        accessKey: string;
        secretKey: string;
      }
    | undefined;
  beforeAll(async () => {
    // Read the canonical bundled configuration without importing test helpers
    // whose PostgreSQL dependencies do not belong to a selected MongoDB product.
    const compose = parse(
      readFileSync(new URL('../../../../../../docker/docker-compose.yml', import.meta.url), 'utf8'),
    ) as {
      services: { s3: { image: string; command: string[] } };
    };
    const accessKey = 'component_test';
    const secretKey = randomUUID();
    const container = await new GenericContainer(compose.services.s3.image)
      .withCommand(compose.services.s3.command)
      .withEnvironment({
        AWS_ACCESS_KEY_ID: accessKey,
        AWS_SECRET_ACCESS_KEY: secretKey,
        WEED_ADMIN_USER: accessKey,
        WEED_ADMIN_PASSWORD: secretKey,
      })
      .withExposedPorts(9000, 9001)
      .withWaitStrategy(Wait.forHttp('/healthz', 9000))
      .withStartupTimeout(120_000)
      .start();
    service = {
      container,
      accessKey,
      secretKey,
      url: `http://${container.getHost()}:${container.getMappedPort(9000)}`,
      adminUrl: `http://${container.getHost()}:${container.getMappedPort(9001)}`,
    };
  }, 120_000);
  afterAll(async () => {
    await service?.container.stop();
  }, 30_000);

  it('creates a bucket and round-trips an object through SeaweedFS', async () => {
    if (!service) {
      throw new Error('The isolated S3 server did not start.');
    }
    const bucket = `nrb-adapter-smoke-${randomUUID()}`;
    const key = 'smoke/ready.txt';
    const sdk = createAwsS3Client(
      new S3ConfigService({
        endpoint: service.url,
        region: 'us-east-1',
        forcePathStyle: true,
        accessKey: service.accessKey,
        secretKey: service.secretKey,
      }),
    );
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
        metadata: { source: 'live-seaweedfs' },
      });

      const object = await storage.getObject({ bucket, key });
      expect(object).toMatchObject({
        key,
        contentType: 'text/plain',
        metadata: { source: 'live-seaweedfs' },
      });
      expect(Buffer.from(object?.body ?? []).toString('utf8')).toBe('ready');
      await expect(storage.listObjects({ bucket, prefix: 'smoke/' })).resolves.toEqual([
        expect.objectContaining({ key, size: 5 }),
      ]);

      const unauthorized = new S3Client({
        endpoint: service.url,
        region: 'us-east-1',
        forcePathStyle: true,
        credentials: { accessKeyId: service.accessKey, secretAccessKey: 'incorrect-test-secret' },
        maxAttempts: 1,
      });
      try {
        await expect(
          unauthorized.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: 'tampered' })),
        ).rejects.toMatchObject({ $metadata: { httpStatusCode: 403 } });
      } finally {
        unauthorized.destroy();
      }
      const anonymous = await fetch(`${service.url}/${bucket}/${key}`, { method: 'PUT', body: 'anonymous' });
      expect(anonymous.status).toBe(403);
      expect(Buffer.from((await storage.getObject({ bucket, key }))?.body ?? []).toString('utf8')).toBe('ready');
      const admin = await fetch(service.adminUrl, { redirect: 'manual' });
      expect(admin.status).toBe(307);
      expect(admin.headers.get('location')).toBe('/login');

      await storage.deleteObject({ bucket, key });
      await expect(storage.getObject({ bucket, key })).resolves.toBeNull();
    } finally {
      if (bucketCreated) {
        await storage.deleteObject({ bucket, key }).catch(() => undefined);
        await sdk.send(new DeleteBucketCommand({ Bucket: bucket })).catch(() => undefined);
      }
      sdk.destroy();
    }
  }, 60_000);
});
