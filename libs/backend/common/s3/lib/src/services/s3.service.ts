import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, GetObjectUrlCommand } from '@aws-sdk/client-s3';

export class S3Service {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(
    region: string,
    accessKeyId: string,
    secretAccessKey: string,
    bucket: string,
  ) {
    this.client = new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });
    this.bucket = bucket;
  }

  async upload(key: string, body: Buffer | Uint8Array, options?: { contentType?: string }): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: options?.contentType }));
  }

  async download(key: string): Promise<Buffer> {
    const { Body } = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await Body!.transformToByteArray());
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async presignedUrl(key: string, expiresIn = 3600): Promise<string> {
    const { URL } = await this.client.send(new GetObjectUrlCommand({ Bucket: this.bucket, Key: key, Expires: expiresIn }));
    return URL!;
  }
}
