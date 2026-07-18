import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AwsS3ObjectStorageClient } from './s3.aws-client';
import { S3Module } from './s3.module';
import { S3Service } from './s3.service';
import { InMemoryObjectStorageClient, ObjectStorageInjectToken, type ObjectStorageClient } from './s3.storage';

describe('S3Module', () => {
  it('provides the configured AWS S3 adapter when none is supplied', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [S3Module.forRoot()],
    }).compile();

    expect(moduleRef.get(ObjectStorageInjectToken)).toBeInstanceOf(AwsS3ObjectStorageClient);
    expect(moduleRef.get(S3Service)).toBeInstanceOf(S3Service);
  });

  it('uses a supplied client', async () => {
    const client: ObjectStorageClient = new InMemoryObjectStorageClient();
    const moduleRef = await Test.createTestingModule({
      imports: [S3Module.forRoot({ client })],
    }).compile();

    expect(moduleRef.get(ObjectStorageInjectToken)).toBe(client);
  });
});
