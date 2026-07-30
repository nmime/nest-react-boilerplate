import type { PlanSummary } from './planner.js';
import { defaultDeploymentConfig, defaultProductConfig, type NrbConfig } from './schema.js';

export function defaultOperationalFields(): Pick<NrbConfig, 'product' | 'deployment'> {
  return {
    product: {
      ...defaultProductConfig,
      mobileTargets: [...defaultProductConfig.mobileTargets],
    },
    deployment: {
      ...defaultDeploymentConfig,
      targets: [...defaultDeploymentConfig.targets],
      infrastructure: { ...defaultDeploymentConfig.infrastructure },
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
