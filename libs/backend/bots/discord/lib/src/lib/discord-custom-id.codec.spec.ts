import { describe, expect, it } from "vitest";
import {
  DiscordCustomIdCodec,
  type DiscordCustomIdAction,
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
    expect(() =>
      codec.assertOwner(codec.decode(customId, { secret, now }), {
        userId: "123456789012345678",
        guildId: "999999999999999999",
        tenantId: "00000000-0000-0000-0000-000000000000",
      }),
    ).toThrow(/owner mismatch/u);
    expect(() =>
      codec.assertOwner(codec.decode(customId, { secret, now }), {
        userId: "123456789012345678",
        guildId: "234567890123456789",
        tenantId: "11111111-1111-1111-1111-111111111111",
      }),
    ).toThrow(/owner mismatch/u);
  });

  it("keeps every supported action within length budget", () => {
    const codec = new DiscordCustomIdCodec();
    const actions: DiscordCustomIdAction[] = [
      "back",
      "home",
      "cancel",
      "open_app",
      "link",
      "unlink",
      "confirm",
    ];

    for (const action of actions) {
      const customId = codec.encode(
        {
          action,
          userId: "123456789012345678",
          guildId: "234567890123456789",
          tenantId: "00000000-0000-0000-0000-000000000000",
        },
        { secret, now, nonceBytes: 8 },
      );

      expect(customId.length, action).toBeLessThanOrEqual(
        DiscordCustomIdMaxLength,
      );
      expect(codec.decode(customId, { secret, now }).action).toBe(action);
    }
  });

  it("rejects malformed, missing nonce, and oversized custom ids", () => {
    const codec = new DiscordCustomIdCodec();
    const customId = codec.encode(
      {
        action: "confirm",
        userId: "123456789012345678",
        guildId: null,
        tenantId: "00000000-0000-0000-0000-000000000000",
      },
      { secret, now },
    );
    const missingNonce = customId.split(":");
    missingNonce[3] = "";

    expect(() => codec.decode("nrb:1:h", { secret, now })).toThrow(
      /Malformed/u,
    );
    expect(() =>
      codec.decode(missingNonce.join(":"), { secret, now }),
    ).toThrow();
    expect(() =>
      codec.encode(
        {
          action: "home",
          nonce: "n".repeat(80),
          userId: "123456789012345678",
          guildId: "234567890123456789",
          tenantId: "11111111-1111-1111-1111-111111111111",
        },
        { secret, now },
      ),
    ).toThrow(/exceeds/u);
  });
});
