// @requirements REQ-API-VALIDATION-004
import { describe, expect, it } from 'vitest';
import { ClientDataValidationException } from '../exception';
import { readSingleFilePart, type MultipartPartLike, type MultipartRequestLike } from './read-single-file-part';

interface FilePartSpec {
  fieldname: string;
  filename?: string;
  mimetype?: string;
  chunks: readonly string[];
  truncated?: boolean;
}

const drained = new Set<string>();

const filePart = (spec: FilePartSpec): MultipartPartLike => ({
  type: 'file',
  fieldname: spec.fieldname,
  filename: 'filename' in spec ? spec.filename : 'photo.png',
  mimetype: 'mimetype' in spec ? spec.mimetype : 'image/png',
  file: Object.assign(
    (async function* stream() {
      for (const chunk of spec.chunks) {
        yield Buffer.from(chunk, 'utf8');
      }
      drained.add(spec.fieldname);
    })(),
    { truncated: spec.truncated ?? false },
  ),
});

const request = (parts: readonly MultipartPartLike[], isMultipart = true): MultipartRequestLike => ({
  isMultipart: () => isMultipart,
  parts: () =>
    (async function* stream() {
      for (const part of parts) {
        yield part;
      }
    })(),
});

const options = { field: 'file', maxBytes: 16, mimeTypes: ['image/png'] } as const;

describe('readSingleFilePart', () => {
  it('returns the declared file part', async () => {
    const uploaded = await readSingleFilePart(
      request([filePart({ fieldname: 'file', chunks: ['ab', 'cd'] })]),
      options,
    );

    expect(uploaded).toEqual({ filename: 'photo.png', mimetype: 'image/png', bytes: Buffer.from('abcd', 'utf8') });
  });

  it('rejects a request that is not multipart', async () => {
    await expect(readSingleFilePart(request([], false), options)).rejects.toBeInstanceOf(ClientDataValidationException);
  });

  it('rejects a request without the declared field', async () => {
    await expect(
      readSingleFilePart(request([filePart({ fieldname: 'other', chunks: ['ab'] })]), options),
    ).rejects.toBeInstanceOf(ClientDataValidationException);
  });

  it('drains parts it does not consume so the connection is not left half-read', async () => {
    drained.clear();

    await readSingleFilePart(
      request([
        { type: 'field', fieldname: 'caption' },
        filePart({ fieldname: 'other', chunks: ['ab'] }),
        filePart({ fieldname: 'file', chunks: ['ab'] }),
        filePart({ fieldname: 'file', chunks: ['cd'] }),
      ]),
      options,
    );

    expect([...drained].sort()).toEqual(['file', 'other']);
  });

  it('rejects a media type outside the allowlist', async () => {
    await expect(
      readSingleFilePart(
        request([filePart({ fieldname: 'file', mimetype: 'application/x-msdownload', chunks: ['ab'] })]),
        options,
      ),
    ).rejects.toBeInstanceOf(ClientDataValidationException);
  });

  it('rejects a file that exceeds the byte cap without buffering the rest', async () => {
    await expect(
      readSingleFilePart(request([filePart({ fieldname: 'file', chunks: ['a'.repeat(32)] })]), options),
    ).rejects.toBeInstanceOf(ClientDataValidationException);
  });

  it('rejects a stream the multipart parser already truncated', async () => {
    await expect(
      readSingleFilePart(request([filePart({ fieldname: 'file', chunks: ['ab'], truncated: true })]), options),
    ).rejects.toBeInstanceOf(ClientDataValidationException);
  });

  it('rejects a file part with no filename', async () => {
    await expect(
      readSingleFilePart(request([filePart({ fieldname: 'file', filename: undefined, chunks: ['ab'] })]), options),
    ).rejects.toBeInstanceOf(ClientDataValidationException);
  });

  it('rejects a file part that declares no media type', async () => {
    await expect(
      readSingleFilePart(request([filePart({ fieldname: 'file', mimetype: undefined, chunks: ['ab'] })]), options),
    ).rejects.toBeInstanceOf(ClientDataValidationException);
  });

  it('names the offending member so the problem is actionable', async () => {
    await expect(readSingleFilePart(request([], false), options)).rejects.toMatchObject({
      extensions: { errors: [{ pointer: '#/file' }] },
    });
  });
});
