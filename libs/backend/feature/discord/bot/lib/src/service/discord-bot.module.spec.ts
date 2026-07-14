import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { DiscordAccountExternalAuthInjectToken } from '../type/discord-account.port';
import { DiscordInteractionRouter } from '../handler/discord-interaction-router';
import { DiscordBotModule } from './discord-bot.module';

describe('DiscordBotModule', () => {
  it('wires the base bot providers so consumers can resolve them', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DiscordBotModule],
    }).compile();

    try {
      expect(moduleRef.get(DiscordInteractionRouter)).toBeInstanceOf(DiscordInteractionRouter);
    } finally {
      await moduleRef.close();
    }
  });

  it('returns base dynamic metadata when no options are provided', () => {
    expect(DiscordBotModule.forRoot()).toEqual({
      module: DiscordBotModule,
      imports: [],
      providers: [],
    });
  });

  it('binds an external-auth provider and forwarded imports', () => {
    const externalAuthProvider = {
      provide: DiscordAccountExternalAuthInjectToken,
      useValue: {},
    };
    const imports = [DiscordBotModule];

    expect(DiscordBotModule.forRoot({ imports, externalAuthProvider })).toEqual({
      module: DiscordBotModule,
      imports,
      providers: [externalAuthProvider],
    });
  });
});
