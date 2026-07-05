import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
  Req,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type {
  APIInteraction,
  APIInteractionResponse,
} from "discord-api-types/v10";
import {
  DiscordBotConfig,
  DiscordInteractionRouter,
  DiscordInteractionSecurity,
} from "@app/backend-feature-discord-bot";

interface RawBodyRequest extends FastifyRequest {
  rawBody?: Buffer | string;
}

@Controller("discord")
export class DiscordInteractionsController {
  constructor(
    private readonly config: DiscordBotConfig,
    private readonly security: DiscordInteractionSecurity,
    private readonly router: DiscordInteractionRouter,
  ) {}

  @Post("interactions")
  async interactions(
    @Req() request: RawBodyRequest,
    @Headers("x-signature-ed25519") signature: string | string[] | undefined,
    @Headers("x-signature-timestamp") timestamp: string | string[] | undefined,
    @Body() body: APIInteraction,
  ): Promise<APIInteractionResponse> {
    const snapshot = this.config.snapshot();
    // Ed25519 verification must run over the exact received bytes. Re-serializing
    // the parsed body would produce different bytes and fail verification, so
    // reject when the raw body is unavailable instead of silently re-encoding.
    if (request.rawBody === undefined) {
      throw new BadRequestException("discord_raw_body_required");
    }
    await this.security.verify({
      rawBody: request.rawBody,
      headers: { signature, timestamp },
      publicKey: snapshot.publicKey,
    });
    return this.router.route(body, {
      customIdSecret: snapshot.customIdSecret,
      tenantId: snapshot.defaultTenantId,
      webAppBaseUrl: snapshot.webAppBaseUrl,
    });
  }
}
