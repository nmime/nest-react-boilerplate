import { ClientDataValidationException } from '../exception';

/** Structural view of `@fastify/multipart`'s file part, so this lib does not depend on the plugin. */
export interface MultipartFilePartLike {
  readonly type: 'file';
  readonly fieldname: string;
  readonly filename?: string;
  readonly mimetype?: string;
  readonly file: AsyncIterable<Buffer> & { readonly truncated?: boolean };
}

export interface MultipartFieldPartLike {
  readonly type: 'field';
  readonly fieldname: string;
}

export type MultipartPartLike = MultipartFilePartLike | MultipartFieldPartLike;

export interface MultipartRequestLike {
  isMultipart: () => boolean;
  parts: () => AsyncIterable<MultipartPartLike>;
}

export interface SingleFilePartOptions {
  /** Multipart field name carrying the file. */
  readonly field: string;
  /** Hard cap on the accepted file size. */
  readonly maxBytes: number;
  /** Accepted declared media types. */
  readonly mimeTypes: readonly string[];
}

export interface UploadedFilePart {
  readonly filename: string;
  readonly mimetype: string;
  readonly bytes: Buffer;
}

function rejectUpload(field: string, detail: string): never {
  throw new ClientDataValidationException([{ detail, pointer: `#/${field}` }]);
}

/**
 * Consumes the remainder of a part we are not keeping.
 *
 * An unread part leaves the multipart parser waiting on a stream nobody is
 * draining, which holds the connection open until it times out — so every
 * rejection path drains before it throws.
 */
async function drainPart(part: MultipartPartLike): Promise<void> {
  if (part.type !== 'file') {
    return;
  }

  for await (const chunk of part.file) {
    void chunk;
  }
}

async function readCappedFile(part: MultipartFilePartLike, options: SingleFilePartOptions): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of part.file) {
    size += chunk.length;
    if (size > options.maxBytes) {
      await drainPart(part);
      rejectUpload(options.field, `file exceeds the ${options.maxBytes} byte limit.`);
    }

    chunks.push(chunk);
  }

  // The parser applies its own configured limit and marks the stream instead of
  // erroring, so a truncated file would otherwise be stored as a valid short one.
  if (part.file.truncated === true) {
    rejectUpload(options.field, `file exceeds the ${options.maxBytes} byte limit.`);
  }

  return Buffer.concat(chunks);
}

/**
 * Reads exactly one file part out of a multipart request, applying the media-type
 * allowlist and byte cap that every upload route needs and that no route should
 * re-implement.
 */
export async function readSingleFilePart(
  request: MultipartRequestLike,
  options: SingleFilePartOptions,
): Promise<UploadedFilePart> {
  if (!request.isMultipart()) {
    rejectUpload(options.field, 'request body must be multipart/form-data.');
  }

  let uploaded: UploadedFilePart | undefined;

  for await (const part of request.parts()) {
    if (uploaded !== undefined || part.type !== 'file' || part.fieldname !== options.field) {
      await drainPart(part);
      continue;
    }

    const mimetype = part.mimetype ?? '';
    if (!options.mimeTypes.includes(mimetype)) {
      await drainPart(part);
      rejectUpload(options.field, `file media type must be one of ${options.mimeTypes.join(', ')}.`);
    }

    const filename = part.filename ?? '';
    if (filename === '') {
      await drainPart(part);
      rejectUpload(options.field, 'file part must declare a filename.');
    }

    uploaded = { filename, mimetype, bytes: await readCappedFile(part, options) };
  }

  return uploaded ?? rejectUpload(options.field, `multipart field "${options.field}" is required.`);
}
