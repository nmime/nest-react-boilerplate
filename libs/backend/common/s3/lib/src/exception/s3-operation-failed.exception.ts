export class ObjectStorageOperationFailedException extends Error {
  constructor(operation: string, cause: unknown) {
    super(`Object storage operation failed: ${operation}`);
    this.name = "ObjectStorageOperationFailedException";
    this.cause = cause;
  }
}

export class S3OperationFailedException extends ObjectStorageOperationFailedException {}
