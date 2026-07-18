import { Inject, Injectable } from '@nestjs/common';
import { S3ConfigService } from './config';
import { ObjectStorageOperationFailedException } from './exception';
import {
  ObjectStorageInjectToken,
  type GetObjectParams,
  type ObjectStorageClient,
  type ObjectStorageObject,
  type ObjectStorageObjectSummary,
  type PutObjectParams,
} from './s3.storage';

export const InjectObjectStorage = (): ParameterDecorator => Inject(ObjectStorageInjectToken);

export type S3PutObjectParams = Omit<PutObjectParams, 'bucket'> & { bucket?: string };
export type S3GetObjectParams = Omit<GetObjectParams, 'bucket'> & { bucket?: string };
export interface S3ListObjectsParams {
  bucket?: string;
  prefix?: string;
}

@Injectable()
export class S3Service {
  constructor(
    @InjectObjectStorage() private readonly client: ObjectStorageClient,
    private readonly config: S3ConfigService,
  ) {}

  putObject(params: S3PutObjectParams): Promise<void> {
    return this.wrap('putObject', () =>
      this.client.putObject({ ...params, bucket: this.resolveBucket(params.bucket) }),
    );
  }

  getObject(params: S3GetObjectParams): Promise<ObjectStorageObject | null> {
    return this.wrap('getObject', () =>
      this.client.getObject({ ...params, bucket: this.resolveBucket(params.bucket) }),
    );
  }

  deleteObject(params: S3GetObjectParams): Promise<void> {
    return this.wrap('deleteObject', () =>
      this.client.deleteObject({ ...params, bucket: this.resolveBucket(params.bucket) }),
    );
  }

  listObjects(params: S3ListObjectsParams = {}): Promise<ObjectStorageObjectSummary[]> {
    return this.wrap('listObjects', () =>
      this.client.listObjects({ ...params, bucket: this.resolveBucket(params.bucket) }),
    );
  }

  private resolveBucket(bucket: string | undefined): string {
    const resolved = bucket?.trim() || this.config.bucket?.trim();
    if (!resolved) {
      throw new Error('S3_BUCKET is required when an operation does not provide an explicit bucket.');
    }
    return resolved;
  }

  private async wrap<T>(operation: string, action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      throw new ObjectStorageOperationFailedException(operation, error);
    }
  }
}
