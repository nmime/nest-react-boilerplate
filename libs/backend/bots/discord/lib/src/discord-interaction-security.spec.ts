import { generateKeyPairSync, sign } from "node:crypto";
import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { DiscordInteractionSecurity } from "./discord-interaction-security";

describe("DiscordInteractionSecurity", () => {
  it("accepts a valid Ed25519 signature over timestamp plus exact raw body", async () => {
    const signed = signedDiscordRequest(Buffer.from('{"type":1}'));

    await expect(
      new DiscordInteractionSecurity().verify({
        rawBody: signed.rawBody,
        headers: { signature: signed.signature, timestamp: signed.timestamp },
        publicKey: signed.publicKey,
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects missing signature headers", async () => {
    await expect(
      new DiscordInteractionSecurity().verify({
        rawBody: Buffer.from("{}"),
        headers: {},
        publicKey: "a".repeat(64),
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects wrong timestamp, public key, signature, and parsed-body replay", async () => {
    const signed = signedDiscordRequest(Buffer.from('{"type":1,"nonce":1}'));
    const wrongPublicKey = signedDiscordRequest(Buffer.from("{}"));
    const wrongSignature = `${signed.signature.slice(0, -1)}${signed.signature.endsWith("0") ? "1" : "0"}`;
    const security = new DiscordInteractionSecurity();

    for (const input of [
      {
        rawBody: signed.rawBody,
        signature: signed.signature,
        timestamp: `${Number(signed.timestamp) + 1}`,
        publicKey: signed.publicKey,
      },
      {
        rawBody: signed.rawBody,
        signature: signed.signature,
        timestamp: signed.timestamp,
        publicKey: wrongPublicKey.publicKey,
      },
      {
        rawBody: signed.rawBody,
        signature: wrongSignature,
        timestamp: signed.timestamp,
        publicKey: signed.publicKey,
      },
      {
        rawBody: JSON.stringify({ nonce: 1, type: 1 }),
        signature: signed.signature,
        timestamp: signed.timestamp,
        publicKey: signed.publicKey,
      },
    ]) {
      await expect(
        security.verify({
          rawBody: input.rawBody,
          headers: { signature: input.signature, timestamp: input.timestamp },
          publicKey: input.publicKey,
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }
  });
});

function signedDiscordRequest(rawBody: Buffer) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const timestamp = "1700000000";
  const signature = sign(
    null,
    Buffer.concat([Buffer.from(timestamp), rawBody]),
    privateKey,
  ).toString("hex");
  const publicKeyBytes = publicKey.export({ format: "der", type: "spki" });

  return {
    rawBody,
    timestamp,
    signature,
    publicKey: publicKeyBytes.subarray(-32).toString("hex"),
  };
}
