import type { RedisHost } from '../type';

export function firstHost(hosts: RedisHost[]): RedisHost {
  const host = hosts.at(0);
  if (!host) {
    throw new Error('At least one Redis host is required.');
  }

  return host;
}
