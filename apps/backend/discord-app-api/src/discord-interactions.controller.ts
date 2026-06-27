import { Body, Controller, Headers, Post, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type {
  APIInteraction,
  APIInteractionResponse,
} from "discord-api-types/v10";
import {
  DiscordBotConfig,
  DiscordInteractionRouter,
  DiscordInteractionSecurity,
} from "@app/backend/bots/discord";

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
    await this.security.verify({
      rawBody: request.rawBody ?? JSON.stringify(body),
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
