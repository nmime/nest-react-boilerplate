import type { RedisConnectionConfig } from '../type';

export function connectionIdentity(config: RedisConnectionConfig): string {
  const target = config.url ?? config.hosts.map((host) => `${host.host}:${host.port}`).join(',');
  return `${config.mode}:${target}/${config.db ?? 0}`;
}
