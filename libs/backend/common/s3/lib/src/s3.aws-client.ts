import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import type { S3ConfigService } from './config';
import type {
  GetObjectParams,
  ObjectStorageClient,
  ObjectStorageObject,
  ObjectStorageObjectSummary,
  PutObjectParams,
} from './s3.storage';

export function createAwsS3Client(config: S3ConfigService): S3Client {
  const clientConfig: S3ClientConfig = {
    region: config.region,
    forcePathStyle: config.forcePathStyle,
  };

  if (config.endpoint) {
    clientConfig.endpoint = config.endpoint;
  }

  const accessKeyId = config.accessKey;
  const secretAccessKey = config.secretKey;
  if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
    throw new Error('S3_ACCESS_KEY and S3_SECRET_KEY must be configured together.');
  }
  if (accessKeyId && secretAccessKey) {
    clientConfig.credentials = { accessKeyId, secretAccessKey };
  }

  return new S3Client(clientConfig);
}

export class AwsS3ObjectStorageClient implements ObjectStorageClient {
  constructor(private readonly client: S3Client) {}

  async putObject(params: PutObjectParams): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: params.bucket,
        Key: params.key,
        Body: params.body,
        ContentType: params.contentType,
        Metadata: params.metadata,
      }),
    );
  }

  async getObject(params: GetObjectParams): Promise<ObjectStorageObject | null> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({
          Bucket: params.bucket,
          Key: params.key,
        }),
      );
      const body = result.Body ? await result.Body.transformToByteArray() : new Uint8Array();

      return {
        key: params.key,
        body,
        contentType: result.ContentType,
        metadata: result.Metadata,
        updatedAt: result.LastModified,
      };
    } catch (error) {
      if (isMissingObject(error)) {
        return null;
      }
      throw error;
    }
  }

  async deleteObject(params: GetObjectParams): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: params.bucket,
        Key: params.key,
      }),
    );
  }

  async listObjects(params: { bucket: string; prefix?: string }): Promise<ObjectStorageObjectSummary[]> {
    const objects: ObjectStorageObjectSummary[] = [];
    let continuationToken: string | undefined;

    do {
      // S3 continuation tokens are returned by the preceding page, so requests must stay sequential.
      // eslint-disable-next-line no-await-in-loop
      const result = await this.client.send(
        new ListObjectsV2Command({
          Bucket: params.bucket,
          Prefix: params.prefix,
          ContinuationToken: continuationToken,
        }),
      );

      for (const object of result.Contents ?? []) {
        if (!object.Key) {
          continue;
        }
        objects.push({
          key: object.Key,
          updatedAt: object.LastModified,
          size: object.Size,
        });
      }

      continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
    } while (continuationToken);

    return objects;
  }
}

function isMissingObject(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const candidate = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  return candidate.name === 'NoSuchKey' || candidate.$metadata?.httpStatusCode === 404;
}
