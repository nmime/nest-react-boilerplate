import { Module } from '@nestjs/common';
import type { DynamicModule, Provider } from '@nestjs/common';
import { S3ConfigModule, S3ConfigService } from './config';
import { AwsS3ObjectStorageClient, createAwsS3Client } from './s3.aws-client';
import { S3Service } from './s3.service';
import { ObjectStorageInjectToken, type ObjectStorageClient } from './s3.storage';

export interface S3ModuleOptions {
  client?: ObjectStorageClient;
}

@Module({})
export class S3Module {
  static forRoot(options: S3ModuleOptions = {}): DynamicModule {
    const clientProvider: Provider = options.client
      ? { provide: ObjectStorageInjectToken, useValue: options.client }
      : {
          provide: ObjectStorageInjectToken,
          inject: [S3ConfigService],
          useFactory: (config: S3ConfigService): ObjectStorageClient =>
            new AwsS3ObjectStorageClient(createAwsS3Client(config)),
        };
    const providers: Provider[] = [clientProvider, S3Service];

    return {
      module: S3Module,
      imports: [S3ConfigModule],
      providers,
      exports: providers,
    };
  }
}
