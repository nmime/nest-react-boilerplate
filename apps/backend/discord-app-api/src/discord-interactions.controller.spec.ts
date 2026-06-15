import { Test } from "@nestjs/testing";
import { InteractionType } from "discord-api-types/v10";
import { describe, expect, it, vi } from "vitest";
import {
  DiscordBotConfig,
  DiscordInteractionRouter,
  DiscordInteractionSecurity,
} from "@app/backend-bot-discord";
import { DiscordInteractionsController } from "./discord-interactions.controller";

describe("DiscordInteractionsController", () => {
  it("verifies exact raw body before routing the parsed interaction", async () => {
    const verify = vi.fn().mockResolvedValue(undefined);
    const route = vi.fn().mockResolvedValue({ type: 1 });
    const moduleRef = await Test.createTestingModule({
      controllers: [DiscordInteractionsController],
      providers: [
        {
          provide: DiscordBotConfig,
          useValue: {
            snapshot: () => ({
              applicationId: "123456789012345678",
              publicKey: "a".repeat(64),
              registrationScope: "global",
              customIdSecret: "custom-secret",
              defaultTenantId: "00000000-0000-0000-0000-000000000000",
              webAppBaseUrl: "https://app.example.test",
            }),
          },
        },
        { provide: DiscordInteractionSecurity, useValue: { verify } },
        { provide: DiscordInteractionRouter, useValue: { route } },
      ],
    }).compile();
    const controller = moduleRef.get(DiscordInteractionsController);
    const rawBody = Buffer.from('{"type":1}');
    const body = {
      type: InteractionType.Ping,
      id: "1",
      application_id: "2",
      version: 1,
    } as never;

    await expect(
      controller.interactions({ rawBody } as never, "sig", "ts", body),
    ).resolves.toEqual({ type: 1 });
    expect(verify).toHaveBeenCalledWith({
      rawBody,
      headers: { signature: "sig", timestamp: "ts" },
      publicKey: "a".repeat(64),
    });
    expect(route).toHaveBeenCalledWith(body, {
      customIdSecret: "custom-secret",
      tenantId: "00000000-0000-0000-0000-000000000000",
      webAppBaseUrl: "https://app.example.test",
    });
    await moduleRef.close();
  });
});
