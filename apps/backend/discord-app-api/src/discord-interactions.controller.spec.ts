import { Test } from "@nestjs/testing";
import { InteractionType } from "discord-api-types/v10";
import { describe, expect, it, vi } from "vitest";
import {
  DiscordBotConfig,
  DiscordInteractionRouter,
  DiscordInteractionSecurity,
} from "@app/backend/bots/discord";
import { DiscordInteractionsController } from "./discord-interactions.controller";

const snapshot = {
  applicationId: "123456789012345678",
  publicKey: "a".repeat(64),
  registrationScope: "global" as const,
  customIdSecret: "custom-secret",
  defaultTenantId: "00000000-0000-0000-0000-000000000000",
  webAppBaseUrl: "https://app.example.test",
};

async function controller(
  verify = vi.fn().mockResolvedValue(undefined),
  route = vi.fn().mockResolvedValue({ type: 1 }),
) {
  const moduleRef = await Test.createTestingModule({
    controllers: [DiscordInteractionsController],
    providers: [
      { provide: DiscordBotConfig, useValue: { snapshot: () => snapshot } },
      { provide: DiscordInteractionSecurity, useValue: { verify } },
      { provide: DiscordInteractionRouter, useValue: { route } },
    ],
  }).compile();

  return {
    moduleRef,
    controller: moduleRef.get(DiscordInteractionsController),
    verify,
    route,
  };
}

const pingBody = {
  type: InteractionType.Ping,
  id: "1",
  application_id: "2",
  version: 1,
} as never;

describe("DiscordInteractionsController", () => {
  it("verifies exact raw body before routing the parsed interaction", async () => {
    const setup = await controller();
    const rawBody = Buffer.from('{"type":1}');

    await expect(
      setup.controller.interactions(
        { rawBody } as never,
        "sig",
        "ts",
        pingBody,
      ),
    ).resolves.toEqual({ type: 1 });
    expect(setup.verify).toHaveBeenCalledWith({
      rawBody,
      headers: { signature: "sig", timestamp: "ts" },
      publicKey: snapshot.publicKey,
    });
    expect(setup.route).toHaveBeenCalledWith(pingBody, {
      customIdSecret: snapshot.customIdSecret,
      tenantId: snapshot.defaultTenantId,
      webAppBaseUrl: snapshot.webAppBaseUrl,
    });
    await setup.moduleRef.close();
  });

  it("falls back to parsed JSON only when rawBody is absent", async () => {
    const setup = await controller();

    await expect(
      setup.controller.interactions({} as never, "sig", "ts", pingBody),
    ).resolves.toEqual({ type: 1 });
    expect(setup.verify).toHaveBeenCalledWith(
      expect.objectContaining({ rawBody: JSON.stringify(pingBody) }),
    );
    await setup.moduleRef.close();
  });

  it("does not route PING when signature verification rejects", async () => {
    const setup = await controller(
      vi.fn().mockRejectedValue(new Error("bad signature")),
      vi.fn(),
    );

    await expect(
      setup.controller.interactions(
        { rawBody: Buffer.from('{"type":1}') } as never,
        "sig",
        "ts",
        pingBody,
      ),
    ).rejects.toThrow("bad signature");
    expect(setup.route).not.toHaveBeenCalled();
    await setup.moduleRef.close();
  });
});
