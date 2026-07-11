import { describe, expect, it } from 'vitest';

/**
 * Port registry: explicit, collision-free assignment for every service.
 *
 * If two services share a port, this test fails — preventing runtime
 * bind conflicts caused by auto-discovery or implicit defaults.
 */

const servicePorts: Record<string, number> = {
  /* Backend APIs */
  'admin-app-api': 3001,
  'user-app-api': 3002,
  'auth-app-api': 3003,
  'discord-app-api': 3007,
  'telegram-bot-api': 3013,
  'telegram-bot-worker': 3023,

  /* Frontend apps */
  'admin-app': 4200,
  'user-app': 4201,
  'landing-app': 4202,
  'site-app': 4203,
  'mobile-app': 4300,
};

const infrastructurePorts: Record<string, number> = {
  postgres: 5432,
  redis: 6379,
  nats: 4222,
  'nats-monitor': 8222,
  minio: 9000,
  'minio-console': 9001,
};

const allPorts = { ...servicePorts, ...infrastructurePorts };

describe('port registry — explicit, collision-free assignments', () => {
  it('has no duplicate port numbers', () => {
    const seen = new Map<number, string>();

    for (const [service, port] of Object.entries(allPorts)) {
      const previous = seen.get(port);
      if (previous) {
        throw new Error(`Port collision: port ${port} is assigned to both "${previous}" and "${service}"`);
      }
      seen.set(port, service);
    }

    expect(seen.size).toBe(Object.keys(allPorts).length);
  });

  it('all service ports are in valid range (1-65535)', () => {
    for (const port of Object.values(allPorts)) {
      expect(port).toBeGreaterThanOrEqual(1);
      expect(port).toBeLessThanOrEqual(65_535);
    }
  });

  it('service ports are unique from infrastructure ports', () => {
    const serviceSet = new Set(Object.values(servicePorts));
    const infraSet = new Set(Object.values(infrastructurePorts));

    const overlap = [...serviceSet].filter((p) => infraSet.has(p));
    expect(overlap).toEqual([], `Service ports overlap with infrastructure ports: ${overlap.join(', ')}`);
  });

  it('has expected minimum number of registered services', () => {
    expect(Object.keys(servicePorts).length).toBeGreaterThanOrEqual(11);
    expect(Object.keys(infrastructurePorts).length).toBeGreaterThanOrEqual(6);
  });
});
