import { describe, expect, it } from 'vitest';
import { ObjectStorageOperationFailedException, S3OperationFailedException } from './s3-operation-failed.exception';

describe('ObjectStorageOperationFailedException', () => {
  it('builds a message from the operation and preserves the cause', () => {
    const cause = new Error('network down');
    const error = new ObjectStorageOperationFailedException('putObject', cause);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ObjectStorageOperationFailedException');
    expect(error.message).toBe('Object storage operation failed: putObject');
    expect(error.cause).toBe(cause);
  });

  it('exposes S3OperationFailedException as a compatible subclass', () => {
    const error = new S3OperationFailedException('getObject', 'reason');

    expect(error).toBeInstanceOf(ObjectStorageOperationFailedException);
    expect(error.message).toBe('Object storage operation failed: getObject');
    expect(error.cause).toBe('reason');
  });
});
