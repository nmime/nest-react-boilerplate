import { Injectable, UnauthorizedException } from "@nestjs/common";
import { verifyKey } from "discord-interactions";

export interface DiscordSignatureHeaders {
  signature?: string | string[];
  timestamp?: string | string[];
}

@Injectable()
export class DiscordInteractionSecurity {
  async verify(input: {
    rawBody: Buffer | string | Uint8Array;
    headers: DiscordSignatureHeaders;
    publicKey: string;
  }): Promise<void> {
    const signature = first(input.headers.signature);
    const timestamp = first(input.headers.timestamp);
    if (!signature || !timestamp) {
      throw new UnauthorizedException("Missing Discord signature headers.");
    }
    const ok = await verifyKey(
      input.rawBody,
      signature,
      timestamp,
      input.publicKey,
    );
    if (!ok) {
      throw new UnauthorizedException("Bad Discord request signature.");
    }
  }
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
