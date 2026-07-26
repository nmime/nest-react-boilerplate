// @requirements REQ-SOCIAL-INGRESS-001
import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InteractionType } from 'discord-api-types/v10';
import { describe, expect, it, vi } from 'vitest';
import {
  DiscordBotConfig,
  DiscordInteractionRouter,
  DiscordInteractionSecurity,
} from '@app/backend-feature-discord-bot';
import { DiscordInteractionsController } from './discord-interactions.controller';

const snapshot = {
  applicationId: '123456789012345678',
  publicKey: 'a'.repeat(64),
  registrationScope: 'global' as const,
  customIdSecret: 'custom-secret',
  defaultTenantId: '00000000-0000-0000-0000-000000000000',
  webAppBaseUrl: 'https://app.example.test',
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

const toControllerRequest = (
  request: Record<string, unknown>,
): Parameters<DiscordInteractionsController['interactions']>[0] =>
  request as unknown as Parameters<DiscordInteractionsController['interactions']>[0];

const toInteractionBody = (
  body: Record<string, unknown>,
): Parameters<DiscordInteractionsController['interactions']>[3] =>
  body as Parameters<DiscordInteractionsController['interactions']>[3];

const pingBody = toInteractionBody({
  application_id: '2',
  id: '1',
  type: InteractionType.Ping,
  version: 1,
});

describe('DiscordInteractionsController', () => {
  it('verifies exact raw body before routing the parsed interaction', async () => {
    const setup = await controller();
    const rawBody = Buffer.from('{"type":1}');

    await expect(
      setup.controller.interactions(toControllerRequest({ rawBody }), 'sig', 'ts', pingBody),
    ).resolves.toEqual({ type: 1 });
    expect(setup.verify).toHaveBeenCalledWith({
      rawBody,
      headers: { signature: 'sig', timestamp: 'ts' },
      publicKey: snapshot.publicKey,
    });
    expect(setup.route).toHaveBeenCalledWith(pingBody, {
      customIdSecret: snapshot.customIdSecret,
      tenantId: snapshot.defaultTenantId,
      webAppBaseUrl: snapshot.webAppBaseUrl,
    });
    await setup.moduleRef.close();
  });

  it('rejects the interaction instead of re-serializing when rawBody is absent', async () => {
    const setup = await controller();

    await expect(setup.controller.interactions(toControllerRequest({}), 'sig', 'ts', pingBody)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(setup.verify).not.toHaveBeenCalled();
    expect(setup.route).not.toHaveBeenCalled();
    await setup.moduleRef.close();
  });

  it('does not route PING when signature verification rejects', async () => {
    const setup = await controller(vi.fn().mockRejectedValue(new Error('bad signature')), vi.fn());

    await expect(
      setup.controller.interactions(toControllerRequest({ rawBody: Buffer.from('{"type":1}') }), 'sig', 'ts', pingBody),
    ).rejects.toThrow('bad signature');
    expect(setup.route).not.toHaveBeenCalled();
    await setup.moduleRef.close();
  });
});
