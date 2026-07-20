export const ObjectStorageInjectToken = Symbol('ObjectStorageInjectToken');

export interface ObjectStorageObject {
  key: string;
  body: Uint8Array;
  contentType?: string;
  metadata?: Record<string, string>;
  updatedAt?: Date;
}

export interface ObjectStorageObjectSummary {
  key: string;
  updatedAt?: Date;
  size?: number;
}

export interface PutObjectParams {
  bucket: string;
  key: string;
  body: string | Uint8Array | Buffer;
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface GetObjectParams {
  bucket: string;
  key: string;
}

export interface ObjectStorageClient {
  putObject(params: PutObjectParams): Promise<void>;
  getObject(params: GetObjectParams): Promise<ObjectStorageObject | null>;
  deleteObject(params: GetObjectParams): Promise<void>;
  listObjects(params: { bucket: string; prefix?: string }): Promise<ObjectStorageObjectSummary[]>;
}

export class InMemoryObjectStorageClient implements ObjectStorageClient {
  private readonly objects = new Map<string, ObjectStorageObject>();

  putObject(params: PutObjectParams): Promise<void> {
    this.objects.set(this.createId(params.bucket, params.key), {
      key: params.key,
      body: typeof params.body === 'string' ? Buffer.from(params.body) : new Uint8Array(params.body),
      contentType: params.contentType,
      metadata: params.metadata ? { ...params.metadata } : undefined,
      updatedAt: new Date(),
    });
    return Promise.resolve();
  }

  getObject(params: GetObjectParams): Promise<ObjectStorageObject | null> {
    const object = this.objects.get(this.createId(params.bucket, params.key));
    return Promise.resolve(object ? this.cloneObject(object) : null);
  }

  deleteObject(params: GetObjectParams): Promise<void> {
    this.objects.delete(this.createId(params.bucket, params.key));
    return Promise.resolve();
  }

  listObjects(params: { bucket: string; prefix?: string }): Promise<ObjectStorageObjectSummary[]> {
    const bucketPrefix = this.createBucketPrefix(params.bucket);
    return Promise.resolve(
      [...this.objects.entries()]
        .filter(
          ([id, object]) => id.startsWith(bucketPrefix) && (!params.prefix || object.key.startsWith(params.prefix)),
        )
        .map(([, object]) => ({
          key: object.key,
          updatedAt: object.updatedAt,
          size: object.body.byteLength,
        })),
    );
  }

  private createId(bucket: string, key: string): string {
    return `${this.createBucketPrefix(bucket)}${key}`;
  }

  private createBucketPrefix(bucket: string): string {
    return `${bucket.length}:${bucket}:`;
  }

  private cloneObject(object: ObjectStorageObject): ObjectStorageObject {
    return {
      ...object,
      body: new Uint8Array(object.body),
      metadata: object.metadata ? { ...object.metadata } : undefined,
      updatedAt: object.updatedAt ? new Date(object.updatedAt) : undefined,
    };
  }
}
