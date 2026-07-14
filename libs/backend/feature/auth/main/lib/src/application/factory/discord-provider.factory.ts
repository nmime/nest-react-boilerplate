import { UnauthorizedException } from '@nestjs/common';
import { Discord } from 'arctic';
import { requireEnv } from '../util/external-auth.util';

export function createDiscordProvider(): Discord {
  return new Discord(
    requireEnv('DISCORD_CLIENT_ID', 'provider_not_configured'),
    requireEnv('DISCORD_CLIENT_SECRET', 'provider_not_configured'),
    requireEnv('DISCORD_REDIRECT_URI', 'provider_not_configured'),
  );
}

export async function fetchDiscordUser(accessToken: string): Promise<{
  id: string;
  username?: string;
  global_name?: string | null;
  avatar?: string | null;
  email?: string | null;
  verified?: boolean;
}> {
  const response = await fetch('https://discord.com/api/users/@me', {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new UnauthorizedException('provider_not_configured');
  }
  return (await response.json()) as {
    id: string;
    username?: string;
    global_name?: string | null;
    avatar?: string | null;
    email?: string | null;
    verified?: boolean;
  };
}
