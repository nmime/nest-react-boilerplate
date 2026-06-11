import { Inject, Injectable } from "@nestjs/common";
import { ObjectStorageOperationFailedException } from "./exception";
import {
  ObjectStorageInjectToken,
  type GetObjectParams,
  type ObjectStorageClient,
  type ObjectStorageObject,
  type PutObjectParams,
} from "./s3.storage";

export const InjectObjectStorage = (): ParameterDecorator =>
  Inject(ObjectStorageInjectToken);

@Injectable()
export class S3Service {
  constructor(
    @InjectObjectStorage() private readonly client: ObjectStorageClient,
  ) {}

  putObject(params: PutObjectParams): Promise<void> {
    return this.wrap("putObject", () => this.client.putObject(params));
  }

  getObject(params: GetObjectParams): Promise<ObjectStorageObject | null> {
    return this.wrap("getObject", () => this.client.getObject(params));
  }

  deleteObject(params: GetObjectParams): Promise<void> {
    return this.wrap("deleteObject", () => this.client.deleteObject(params));
  }

  listObjects(params: {
    bucket: string;
    prefix?: string;
  }): Promise<ObjectStorageObject[]> {
    return this.wrap("listObjects", () => this.client.listObjects(params));
  }

  private async wrap<T>(
    operation: string,
    action: () => Promise<T>,
  ): Promise<T> {
    try {
      return await action();
    } catch (error) {
      throw new ObjectStorageOperationFailedException(operation, error);
    }
  }
}
