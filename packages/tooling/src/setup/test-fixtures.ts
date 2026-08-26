import type { PlanSummary } from './planner.js';
import {
  defaultDeploymentConfig,
  defaultIdentityConfig,
  defaultIdentityBrandConfig,
  defaultProductConfig,
  defaultRuntimeConfig,
  defaultRuntimePorts,
  defaultSessionConfig,
  defaultTenantConfig,
  defaultTenantSeedAdmin,
  defaultTenantSeedUsers,
  type NrbConfig,
} from './schema.js';

export function defaultOperationalFields(): Pick<
  NrbConfig,
  'product' | 'deployment' | 'identity' | 'runtime' | 'session' | 'tenant'
> {
  return {
    product: {
      ...defaultProductConfig,
      mobileTargets: [...defaultProductConfig.mobileTargets],
    },
    deployment: {
      ...defaultDeploymentConfig,
      targets: [...defaultDeploymentConfig.targets],
      infrastructure: { ...defaultDeploymentConfig.infrastructure },
      imageRegistry: defaultDeploymentConfig.imageRegistry,
    },
    identity: {
      ...defaultIdentityConfig,
      brand: { ...defaultIdentityBrandConfig },
    },
    runtime: {
      ports: { ...defaultRuntimePorts },
      stagingOffset: defaultRuntimeConfig.stagingOffset,
      containerPort: defaultRuntimeConfig.containerPort,
      postgres: { ...defaultRuntimeConfig.postgres },
      minio: { ...defaultRuntimeConfig.minio },
      localSecrets: { ...defaultRuntimeConfig.localSecrets },
    },
    session: { ...defaultSessionConfig },
    tenant: {
      defaultTenantId: defaultTenantConfig.defaultTenantId,
      seed: {
        admin: { ...defaultTenantSeedAdmin },
        users: [...defaultTenantSeedUsers],
      },
    },
  };
}

export function planSummaryFixture(overrides: Partial<PlanSummary> = {}): PlanSummary {
  return {
    apps: [],
    capabilities: [],
    configHash: 'fixture',
    ...defaultOperationalFields(),
    ...overrides,
  };
}
