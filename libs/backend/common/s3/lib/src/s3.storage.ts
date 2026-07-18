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
      metadata: params.metadata,
      updatedAt: new Date(),
    });
    return Promise.resolve();
  }

  getObject(params: GetObjectParams): Promise<ObjectStorageObject | null> {
    return Promise.resolve(this.objects.get(this.createId(params.bucket, params.key)) ?? null);
  }

  deleteObject(params: GetObjectParams): Promise<void> {
    this.objects.delete(this.createId(params.bucket, params.key));
    return Promise.resolve();
  }

  listObjects(params: { bucket: string; prefix?: string }): Promise<ObjectStorageObjectSummary[]> {
    const prefix = `${params.bucket}/`;
    return Promise.resolve(
      [...this.objects.entries()]
        .filter(([id, object]) => id.startsWith(prefix) && (!params.prefix || object.key.startsWith(params.prefix)))
        .map(([, object]) => ({
          key: object.key,
          updatedAt: object.updatedAt,
          size: object.body.byteLength,
        })),
    );
  }

  private createId(bucket: string, key: string): string {
    return `${bucket}/${key}`;
  }
}
