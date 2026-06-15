import { describe, expect, it } from "vitest";
import {
  DiscordCustomIdCodec,
  DiscordCustomIdMaxLength,
} from "./discord-custom-id.codec";

const secret = "test-secret-with-enough-entropy";
const now = () => 1_700_000_000_000;

describe("DiscordCustomIdCodec", () => {
  it("round trips compact signed owner-scoped component state within Discord length budget", () => {
    const codec = new DiscordCustomIdCodec();
    const customId = codec.encode(
      {
        action: "link",
        userId: "123456789012345678",
        guildId: "234567890123456789",
        tenantId: "00000000-0000-0000-0000-000000000000",
      },
      { secret, now, nonceBytes: 6 },
    );

    expect(customId.length).toBeLessThanOrEqual(DiscordCustomIdMaxLength);
    const decoded = codec.decode(customId, { secret, now });
    expect(decoded).toMatchObject({
      action: "link",
      userId: "123456789012345678",
      guildId: "234567890123456789",
      tenantId: "00000000000000000000000000000000",
    });
    expect(() =>
      codec.assertOwner(decoded, {
        userId: "123456789012345678",
        guildId: "234567890123456789",
        tenantId: "00000000-0000-0000-0000-000000000000",
      }),
    ).not.toThrow();
  });

  it("rejects tampered, expired, and mismatched component ids", () => {
    const codec = new DiscordCustomIdCodec();
    const customId = codec.encode(
      {
        action: "unlink",
        userId: "123456789012345678",
        guildId: "234567890123456789",
        tenantId: "00000000-0000-0000-0000-000000000000",
      },
      { secret, now, ttlSeconds: 1 },
    );

    expect(() =>
      codec.decode(customId.replace(":u:", ":l:"), { secret, now }),
    ).toThrow(/signature/u);
    expect(() =>
      codec.decode(customId, { secret, now: () => now() + 2_000 }),
    ).toThrow(/Expired/u);
    expect(() =>
      codec.assertOwner(codec.decode(customId, { secret, now }), {
        userId: "999",
        guildId: "234567890123456789",
        tenantId: "00000000-0000-0000-0000-000000000000",
      }),
    ).toThrow(/owner mismatch/u);
  });
});
