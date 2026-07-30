// @requirements REQ-RUNTIME-STORAGE-007
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { S3ConfigService } from './s3.config.service';

describe('S3ConfigService', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses explicit config before environment values', () => {
    vi.stubEnv('S3_ENDPOINT', 'https://env-s3.example.com');
    vi.stubEnv('S3_REGION', 'eu-west-1');
    vi.stubEnv('S3_BUCKET', 'env-bucket');
    vi.stubEnv('S3_ACCESS_KEY', 'env-access');
    vi.stubEnv('S3_SECRET_KEY', 'env-secret');
    vi.stubEnv('S3_FORCE_PATH_STYLE', 'false');

    const service = new S3ConfigService({
      endpoint: 'https://configured-s3.example.com',
      region: 'us-east-1',
      bucket: 'configured-bucket',
      accessKey: 'configured-access',
      secretKey: 'configured-secret',
      forcePathStyle: true,
    });

    expect(service.endpoint).toBe('https://configured-s3.example.com');
    expect(service.region).toBe('us-east-1');
    expect(service.bucket).toBe('configured-bucket');
    expect(service.accessKey).toBe('configured-access');
    expect(service.secretKey).toBe('configured-secret');
    expect(service.forcePathStyle).toBe(true);
  });

  it('reads optional values from environment through createConfig', () => {
    vi.stubEnv('S3_ENDPOINT', 'https://env-s3.example.com');
    vi.stubEnv('S3_REGION', 'eu-west-1');
    vi.stubEnv('S3_BUCKET', 'env-bucket');
    vi.stubEnv('S3_ACCESS_KEY', 'env-access');
    vi.stubEnv('S3_SECRET_KEY', 'env-secret');
    vi.stubEnv('S3_FORCE_PATH_STYLE', 'true');

    const service = new S3ConfigService();

    expect(service.endpoint).toBe('https://env-s3.example.com');
    expect(service.region).toBe('eu-west-1');
    expect(service.bucket).toBe('env-bucket');
    expect(service.accessKey).toBe('env-access');
    expect(service.secretKey).toBe('env-secret');
    expect(service.forcePathStyle).toBe(true);
  });
});
