import { describe, expect, it } from "vitest";
import { InMemoryEmailProvider, NoopEmailProvider } from "./index";

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
});
