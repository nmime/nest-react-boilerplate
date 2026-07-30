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
import { DiscordInteractionReplayProtection } from './discord-interaction-replay-protection';

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
  replay = {
    reserve: vi.fn().mockResolvedValue({ key: 'discord:1', ownerValue: 'processing:owner' }),
    complete: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
  },
) {
  const moduleRef = await Test.createTestingModule({
    controllers: [DiscordInteractionsController],
    providers: [
      { provide: DiscordBotConfig, useValue: { snapshot: () => snapshot } },
      { provide: DiscordInteractionSecurity, useValue: { verify } },
      { provide: DiscordInteractionReplayProtection, useValue: replay },
      { provide: DiscordInteractionRouter, useValue: { route } },
    ],
  }).compile();

  return {
    moduleRef,
    controller: moduleRef.get(DiscordInteractionsController),
    verify,
    ...replay,
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
    expect(setup.reserve).toHaveBeenCalledWith(pingBody.id);
    expect(setup.complete).toHaveBeenCalledWith({ key: 'discord:1', ownerValue: 'processing:owner' });
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
    expect(setup.reserve).not.toHaveBeenCalled();
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

  it('does not route a replayed interaction', async () => {
    const setup = await controller(vi.fn().mockResolvedValue(undefined), vi.fn(), {
      reserve: vi.fn().mockRejectedValue(new Error('replayed')),
      complete: vi.fn(),
      release: vi.fn(),
    });

    await expect(
      setup.controller.interactions(toControllerRequest({ rawBody: Buffer.from('{"type":1}') }), 'sig', 'ts', pingBody),
    ).rejects.toThrow('replayed');
    expect(setup.route).not.toHaveBeenCalled();
    await setup.moduleRef.close();
  });

  it('releases only its reservation when routing fails', async () => {
    const routeError = new Error('transient route failure');
    const setup = await controller(vi.fn().mockResolvedValue(undefined), vi.fn().mockRejectedValue(routeError));

    await expect(
      setup.controller.interactions(toControllerRequest({ rawBody: Buffer.from('{"type":1}') }), 'sig', 'ts', pingBody),
    ).rejects.toBe(routeError);
    expect(setup.release).toHaveBeenCalledWith({ key: 'discord:1', ownerValue: 'processing:owner' });
    expect(setup.complete).not.toHaveBeenCalled();
    await setup.moduleRef.close();
  });

  it('does not release a successfully routed interaction when completion storage fails', async () => {
    const completionError = new Error('completion unavailable');
    const replay = {
      reserve: vi.fn().mockResolvedValue({ key: 'discord:1', ownerValue: 'processing:owner' }),
      complete: vi.fn().mockRejectedValue(completionError),
      release: vi.fn(),
    };
    const setup = await controller(
      vi.fn().mockResolvedValue(undefined),
      vi.fn().mockResolvedValue({ type: 1 }),
      replay,
    );

    await expect(
      setup.controller.interactions(toControllerRequest({ rawBody: Buffer.from('{"type":1}') }), 'sig', 'ts', pingBody),
    ).rejects.toBe(completionError);
    expect(setup.route).toHaveBeenCalledOnce();
    expect(setup.release).not.toHaveBeenCalled();
    await setup.moduleRef.close();
  });
});
