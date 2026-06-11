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
  return Buffer.from(
    `${message.subject}:${message.to.map(({ email }) => email).join(",")}`,
  )
    .toString("base64url")
    .slice(0, 24);
}

function getValidationError(message: EmailMessage): Error | undefined {
  try {
    validateEmailMessage(message);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}
