import { describe, expect, it } from "vitest";
import {
  createNoopEmailProvider,
  InMemoryEmailProvider,
  NoopEmailProvider,
  validateEmailMessage,
} from "./index";

function throwUnexpectedValidationValue(value: unknown): never {
  throw value;
}

describe("email providers", () => {
  it("validates and records in-memory messages", async () => {
    const provider = new InMemoryEmailProvider();

    await expect(
      provider.send({
        subject: "Welcome",
        text: "Hello",
        to: [{ email: "user@example.com" }],
      }),
    ).resolves.toMatchObject({
      accepted: ["user@example.com"],
      provider: "in-memory",
    });

    expect(provider.sent).toHaveLength(1);
  });

  it("fails closed when required message fields are missing", async () => {
    await expect(
      new NoopEmailProvider().send({ subject: "", text: "", to: [] }),
    ).rejects.toThrow("at least one recipient");
  });

  it("keeps noop message ids stable without Node runtime primitives", async () => {
    await expect(
      new NoopEmailProvider().send({
        subject: "Привет",
        text: "Hello",
        to: [{ email: "user@example.com" }],
      }),
    ).resolves.toMatchObject({
      messageId: "noop:0J_RgNC40LLQtdGCOnVzZXJA",
    });
  });

  it("exposes a factory that builds a working noop provider", async () => {
    const provider = createNoopEmailProvider();

    expect(provider.name).toBe("noop");
    await expect(
      provider.send({
        subject: "Welcome",
        text: "Hello",
        to: [{ email: "user@example.com" }],
      }),
    ).resolves.toMatchObject({ provider: "noop", rejected: [] });
  });

  it("rejects invalid in-memory messages without recording them", async () => {
    const provider = new InMemoryEmailProvider();

    await expect(
      provider.send({ subject: "", text: "Hello", to: [{ email: "u@x.com" }] }),
    ).rejects.toThrow("subject");
    expect(provider.sent).toHaveLength(0);
  });

  it("normalizes unexpected validation throwables to Error instances", async () => {
    const subject = {
      trim() {
        return throwUnexpectedValidationValue("subject trim failed");
      },
    };

    await expect(
      new NoopEmailProvider().send({
        subject: subject as unknown as string,
        text: "Hello",
        to: [{ email: "u@x.com" }],
      }),
    ).rejects.toThrow("subject trim failed");
  });

  it("deep clones stored in-memory messages so later mutation cannot leak", async () => {
    const provider = new InMemoryEmailProvider();
    const original = {
      subject: "Report",
      html: "<p>Hi</p>",
      to: [{ email: "a@example.com", name: "A" }],
      attachments: [
        { filename: "f.txt", contentType: "text/plain", content: "x" },
      ],
      metadata: { campaign: "welcome" },
      tags: ["marketing"],
    };

    await provider.send(original);
    const stored = provider.sent[0];

    expect(stored).not.toBe(original);
    expect(stored.to[0]).not.toBe(original.to[0]);
    expect(stored.to[0]).toEqual({ email: "a@example.com", name: "A" });
    expect(stored.attachments?.[0]).not.toBe(original.attachments[0]);
    expect(stored.attachments?.[0]).toEqual(original.attachments[0]);
    expect(stored.metadata).not.toBe(original.metadata);
    expect(stored.tags).not.toBe(original.tags);
    expect(stored.tags).toEqual(["marketing"]);
  });

  describe("validateEmailMessage", () => {
    it("requires a non-blank subject", () => {
      expect(() => {
        validateEmailMessage({
          subject: "   ",
          text: "Hello",
          to: [{ email: "u@x.com" }],
        });
      }).toThrow("subject");
    });

    it("requires either text or html content", () => {
      expect(() => {
        validateEmailMessage({
          subject: "Subject",
          text: "  ",
          html: "",
          to: [{ email: "u@x.com" }],
        });
      }).toThrow("text or html");
    });

    it("treats an absent html field as empty content", () => {
      // text blank + html undefined exercises the `?? ""` fallback on html.
      expect(() => {
        validateEmailMessage({
          subject: "Subject",
          text: "",
          to: [{ email: "u@x.com" }],
        });
      }).toThrow("text or html");
    });

    it("accepts a fully populated message", () => {
      expect(() => {
        validateEmailMessage({
          subject: "Subject",
          html: "<p>Hi</p>",
          to: [{ email: "u@x.com" }],
        });
      }).not.toThrow();
    });
  });

  it("encodes multi-byte subjects deterministically across code point widths", async () => {
    const provider = new NoopEmailProvider();
    const send = (subject: string) =>
      provider.send({
        subject,
        text: "Hello",
        to: [{ email: "user@example.com" }],
      });

    // Three-byte (CJK, <= U+FFFF) and four-byte (emoji, > U+FFFF) code points.
    const cjk = await send("日本語");
    const emoji = await send("🎉🚀");
    const emojiAgain = await send("🎉🚀");

    expect(cjk.messageId).toMatch(/^noop:/u);
    expect(emoji.messageId).toMatch(/^noop:/u);
    expect(cjk.messageId).not.toBe(emoji.messageId);
    expect(emojiAgain.messageId).toBe(emoji.messageId);
  });

  it("pads base64url ids for payloads that do not align to three-byte groups", async () => {
    const provider = new NoopEmailProvider();
    const idFor = async (subject: string) =>
      (
        await provider.send({
          subject,
          text: "Hello",
          to: [{ email: "a@b.co" }],
        })
      ).messageId;

    // "X:a@b.co" = 8 bytes (2 left over) and "XYZ:a@b.co" = 10 bytes (1 left
    // over) drive the trailing partial-group encoding branches.
    const remainderTwo = await idFor("X");
    const remainderOne = await idFor("XYZ");

    expect(remainderTwo).toMatch(/^noop:[\w-]+$/u);
    expect(remainderOne).toMatch(/^noop:[\w-]+$/u);
    expect(remainderTwo).not.toBe(remainderOne);
  });
});
