// @requirements REQ-RUNTIME-STORAGE-007
import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { S3ConfigModule } from './s3.config.module';
import { S3ConfigService } from './s3.config.service';

describe('S3ConfigModule', () => {
  it('declares and exports the config service', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, S3ConfigModule)).toContain(S3ConfigService);
    expect(Reflect.getMetadata(MODULE_METADATA.EXPORTS, S3ConfigModule)).toContain(S3ConfigService);
  });
});
