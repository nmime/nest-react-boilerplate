export interface EmailAddress {
  email: string;
  name?: string;
}

export interface EmailAttachment {
  filename: string;
  contentType: string;
  content: string | Uint8Array;
}

export interface EmailMessage {
  to: EmailAddress[];
  from?: EmailAddress;
  replyTo?: EmailAddress;
  subject: string;
  text?: string;
  html?: string;
  tags?: readonly string[];
  metadata?: Readonly<Record<string, string>>;
  attachments?: readonly EmailAttachment[];
}

export interface SendEmailResult {
  provider: string;
  messageId: string;
  accepted: string[];
  rejected: string[];
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<SendEmailResult>;
}

export const EMAIL_PROVIDER = Symbol("EMAIL_PROVIDER");

export class NoopEmailProvider implements EmailProvider {
  readonly name = "noop";

  send(message: EmailMessage): Promise<SendEmailResult> {
    const validationError = getValidationError(message);

    if (validationError !== undefined) {
      return Promise.reject(validationError);
    }

    return Promise.resolve({
      provider: this.name,
      messageId: `noop:${stableMessageId(message)}`,
      accepted: message.to.map(({ email }) => email),
      rejected: [],
    });
  }
}

export class InMemoryEmailProvider implements EmailProvider {
  readonly name = "in-memory";
  readonly sent: EmailMessage[] = [];

  send(message: EmailMessage): Promise<SendEmailResult> {
    const validationError = getValidationError(message);

    if (validationError !== undefined) {
      return Promise.reject(validationError);
    }

    this.sent.push(cloneEmailMessage(message));

    return Promise.resolve({
      provider: this.name,
      messageId: `memory:${this.sent.length}`,
      accepted: message.to.map(({ email }) => email),
      rejected: [],
    });
  }
}

export function createNoopEmailProvider(): EmailProvider {
  return new NoopEmailProvider();
}

export function validateEmailMessage(message: EmailMessage): void {
  if (message.to.length === 0) {
    throw new Error("Email message requires at least one recipient.");
  }

  if (message.subject.trim() === "") {
    throw new Error("Email message requires a subject.");
  }

  if (
    (message.text ?? "").trim() === "" &&
    (message.html ?? "").trim() === ""
  ) {
    throw new Error("Email message requires text or html content.");
  }
}

function cloneEmailMessage(message: EmailMessage): EmailMessage {
  return {
    ...message,
    attachments: message.attachments?.map((attachment) => ({ ...attachment })),
    metadata:
      message.metadata === undefined ? undefined : { ...message.metadata },
    tags: message.tags === undefined ? undefined : [...message.tags],
    to: message.to.map((address) => ({ ...address })),
  };
}

function stableMessageId(message: EmailMessage): string {
  return base64UrlEncodeUtf8(
    `${message.subject}:${message.to.map(({ email }) => email).join(",")}`,
  ).slice(0, 24);
}

function base64UrlEncodeUtf8(value: string): string {
  const bytes = utf8Bytes(value);
  let encoded = "";

  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const hasSecond = index + 1 < bytes.length;
    const hasThird = index + 2 < bytes.length;
    const second = hasSecond ? (bytes[index + 1] ?? 0) : 0;
    const third = hasThird ? (bytes[index + 2] ?? 0) : 0;
    const chunk = (first << 16) | (second << 8) | third;

    encoded += base64UrlCharacter((chunk >> 18) & 63);
    encoded += base64UrlCharacter((chunk >> 12) & 63);

    if (hasSecond) {
      encoded += base64UrlCharacter((chunk >> 6) & 63);
    }

    if (hasThird) {
      encoded += base64UrlCharacter(chunk & 63);
    }
  }

  return encoded;
}

function base64UrlCharacter(index: number): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ" +
    "abcdefghijklmnopqrstuvwxyz" +
    "0123456789" +
    "-_";

  return alphabet[index];
}

function utf8Bytes(value: string): number[] {
  return [...value].flatMap((character) => {
    const codePoint = character.codePointAt(0) ?? 0;

    if (codePoint <= 0x7f) {
      return [codePoint];
    }

    if (codePoint <= 0x7ff) {
      return [0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f)];
    }

    if (codePoint <= 0xffff) {
      return [
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      ];
    }

    return [
      0xf0 | (codePoint >> 18),
      0x80 | ((codePoint >> 12) & 0x3f),
      0x80 | ((codePoint >> 6) & 0x3f),
      0x80 | (codePoint & 0x3f),
    ];
  });
}

function getValidationError(message: EmailMessage): Error | undefined {
  try {
    validateEmailMessage(message);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}
