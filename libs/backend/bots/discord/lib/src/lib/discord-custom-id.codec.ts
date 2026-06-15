import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { DefaultDiscordCustomIdTtlSeconds } from "./discord-config";

export type DiscordCustomIdAction =
  | "back"
  | "home"
  | "cancel"
  | "open_app"
  | "link"
  | "unlink"
  | "confirm";

export interface DiscordCustomIdPayload {
  action: DiscordCustomIdAction;
  nonce?: string;
  userId: string;
  guildId?: string | null;
  tenantId: string;
  issuedAt?: number;
  expiresAt?: number;
}

export interface DiscordCustomIdCodecOptions {
  secret: string;
  now?: () => number;
  ttlSeconds?: number;
  nonceBytes?: number;
  signatureBytes?: number;
}

export interface DiscordDecodedCustomId extends Required<DiscordCustomIdPayload> {
  version: "1";
}

const prefix = "nrb";
const version = "1";
const maxCustomIdLength = 100;
const defaultSignatureBytes = 8;
const emptyGuild = "-";

@Injectable()
export class DiscordCustomIdCodec {
  encode(
    payload: DiscordCustomIdPayload,
    options: DiscordCustomIdCodecOptions,
  ): string {
    const now = Math.floor((options.now?.() ?? Date.now()) / 1000);
    const nonce =
      payload.nonce ??
      randomBytes(options.nonceBytes ?? 8).toString("base64url");
    const issuedAt = payload.issuedAt ?? now;
    const expiresAt =
      payload.expiresAt ??
      issuedAt + (options.ttlSeconds ?? DefaultDiscordCustomIdTtlSeconds);
    const body = [
      prefix,
      version,
      actionToCode(payload.action),
      nonce,
      encodeSnowflake(payload.userId),
      payload.guildId?.trim() ? encodeSnowflake(payload.guildId) : emptyGuild,
      shortTenant(payload.tenantId),
      issuedAt.toString(36),
      expiresAt.toString(36),
    ].join(":");
    const customId = `${body}:${sign(body, options.secret, options.signatureBytes)}`;
    if (customId.length > maxCustomIdLength) {
      throw new Error(
        `Discord custom_id exceeds ${maxCustomIdLength} characters.`,
      );
    }
    return customId;
  }

  decode(
    customId: string,
    options: DiscordCustomIdCodecOptions,
  ): DiscordDecodedCustomId {
    const parts = customId.split(":");
    if (parts.length !== 10) {
      throw new Error("Malformed Discord custom_id.");
    }
    const [
      actualPrefix,
      actualVersion,
      actionCode,
      nonce,
      userId,
      guildId,
      tenantId,
      issued,
      expires,
      signature,
    ] = parts;
    if (actualPrefix !== prefix || actualVersion !== version) {
      throw new Error("Unsupported Discord custom_id version.");
    }
    const action = codeToAction(actionCode);
    const body = parts.slice(0, -1).join(":");
    if (
      !safeEqual(signature, sign(body, options.secret, options.signatureBytes))
    ) {
      throw new Error("Invalid Discord custom_id signature.");
    }
    const issuedAt = Number.parseInt(issued, 36);
    const expiresAt = Number.parseInt(expires, 36);
    const now = Math.floor((options.now?.() ?? Date.now()) / 1000);
    if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) {
      throw new Error("Invalid Discord custom_id timestamps.");
    }
    if (expiresAt <= now) {
      throw new Error("Expired Discord custom_id.");
    }
    return {
      version,
      action,
      nonce,
      userId: decodeSnowflake(userId),
      guildId: guildId === emptyGuild ? "" : decodeSnowflake(guildId),
      tenantId:
        tenantId === "0" ? "00000000000000000000000000000000" : tenantId,
      issuedAt,
      expiresAt,
    };
  }

  assertOwner(
    decoded: DiscordDecodedCustomId,
    owner: { userId: string; guildId?: string | null; tenantId: string },
  ): void {
    if (
      decoded.userId !== owner.userId ||
      normalizeTenant(decoded.tenantId) !== normalizeTenant(owner.tenantId) ||
      (decoded.guildId || "") !== (owner.guildId?.trim() || "")
    ) {
      throw new Error("Discord custom_id owner mismatch.");
    }
  }
}

export const DiscordCustomIdMaxLength = maxCustomIdLength;

function sign(
  body: string,
  secret: string,
  signatureBytes = defaultSignatureBytes,
): string {
  return createHmac("sha256", secret)
    .update(body)
    .digest()
    .subarray(0, signatureBytes)
    .toString("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

const actionCodes: Record<DiscordCustomIdAction, string> = {
  back: "b",
  home: "h",
  cancel: "c",
  open_app: "o",
  link: "l",
  unlink: "u",
  confirm: "y",
};

function actionToCode(action: DiscordCustomIdAction): string {
  return actionCodes[action];
}

function codeToAction(code: string): DiscordCustomIdAction {
  const action = (Object.entries(actionCodes).find(
    ([, value]) => value === code,
  )?.[0] ?? "") as DiscordCustomIdAction;
  if (!action) {
    throw new Error("Unsupported Discord component action.");
  }
  return action;
}

function encodeSnowflake(value: string): string {
  return /^\d+$/u.test(value)
    ? BigInt(value).toString(36)
    : `_${Buffer.from(value).toString("base64url")}`;
}

function decodeSnowflake(value: string): string {
  return value.startsWith("_")
    ? Buffer.from(value.slice(1), "base64url").toString("utf8")
    : parseBase36BigInt(value).toString(10);
}

function normalizeTenant(value: string): string {
  return value.trim().toLowerCase().replaceAll("-", "");
}

function shortTenant(value: string): string {
  const normalized = normalizeTenant(value);
  return normalized === "00000000000000000000000000000000" ? "0" : normalized;
}

function parseBase36BigInt(value: string): bigint {
  return [...value].reduce((sum, char) => {
    const digit = Number.parseInt(char, 36);
    if (!Number.isFinite(digit)) {
      throw new Error("Invalid base36 snowflake.");
    }
    return sum * 36n + BigInt(digit);
  }, 0n);
}
