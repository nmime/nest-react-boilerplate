import { describe, expect, it } from 'vitest';
import { InMemoryObjectStorageClient } from './s3.storage';

describe('InMemoryObjectStorageClient', () => {
  it('stores a string body as bytes and reads it back', async () => {
    const client = new InMemoryObjectStorageClient();

    await client.putObject({
      bucket: 'media',
      key: 'greeting.txt',
      body: 'hello',
      contentType: 'text/plain',
      metadata: { origin: 'test' },
    });

    const object = await client.getObject({
      bucket: 'media',
      key: 'greeting.txt',
    });

    expect(object).not.toBeNull();
    expect(object?.key).toBe('greeting.txt');
    expect(Buffer.from(object?.body ?? new Uint8Array()).toString()).toBe('hello');
    expect(object?.contentType).toBe('text/plain');
    expect(object?.metadata).toEqual({ origin: 'test' });
    expect(object?.updatedAt).toBeInstanceOf(Date);
  });

  it('stores a binary body without re-encoding it', async () => {
    const client = new InMemoryObjectStorageClient();
    const body = new Uint8Array([1, 2, 3]);

    await client.putObject({ bucket: 'media', key: 'blob.bin', body });

    const object = await client.getObject({ bucket: 'media', key: 'blob.bin' });

    expect(object?.body).toEqual(body);
    expect(object?.contentType).toBeUndefined();
    expect(object?.metadata).toBeUndefined();
  });

  it('returns null for a missing object', async () => {
    const client = new InMemoryObjectStorageClient();

    await expect(client.getObject({ bucket: 'media', key: 'missing' })).resolves.toBeNull();
  });

  it('deletes an object', async () => {
    const client = new InMemoryObjectStorageClient();
    await client.putObject({ bucket: 'media', key: 'temp', body: 'x' });

    await client.deleteObject({ bucket: 'media', key: 'temp' });

    await expect(client.getObject({ bucket: 'media', key: 'temp' })).resolves.toBeNull();
  });

  it('isolates objects by bucket when listing', async () => {
    const client = new InMemoryObjectStorageClient();
    await client.putObject({ bucket: 'media', key: 'a', body: 'a' });
    await client.putObject({ bucket: 'media', key: 'b', body: 'b' });
    await client.putObject({ bucket: 'other', key: 'c', body: 'c' });

    const objects = await client.listObjects({ bucket: 'media' });

    expect(objects.map((object) => object.key).sort((a, b) => a.localeCompare(b))).toEqual(['a', 'b']);
  });

  it('filters listed objects by key prefix', async () => {
    const client = new InMemoryObjectStorageClient();
    await client.putObject({ bucket: 'media', key: 'img/a.png', body: 'a' });
    await client.putObject({ bucket: 'media', key: 'img/b.png', body: 'b' });
    await client.putObject({ bucket: 'media', key: 'doc/c.pdf', body: 'c' });

    const objects = await client.listObjects({
      bucket: 'media',
      prefix: 'img/',
    });

    expect(objects.map((object) => object.key).sort((a, b) => a.localeCompare(b))).toEqual(['img/a.png', 'img/b.png']);
  });
});
