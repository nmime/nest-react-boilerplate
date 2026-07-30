# Feature flags

`@app/common-feature-flags` provides the repository-level feature flag contract.
It is intentionally small so apps can start with environment flags and later
use the selected PostgreSQL or MongoDB adapter, or swap in LaunchDarkly,
ConfigCat, or Unleash without changing feature code. The MongoDB adapter owns a
strict validator plus tenant/key and enabled-query indexes. The keys below are
illustrative examples, not a catalogue of shipped product features.

The current setup catalog still generates `FeatureFlagsPostgresModule` wiring
for the `feature-flags` capability. Until that source entry becomes
provider-aware, do not combine setup-selected `feature-flags` with MongoDB even
though the MongoDB adapter and provider-selecting admin composition exist.

## API

```ts
import { EnvironmentFeatureFlagProvider, type FeatureFlagProvider } from '@app/common-feature-flags';

const flags: FeatureFlagProvider = new EnvironmentFeatureFlagProvider();
const enabled = await flags.isEnabled('example.rollout', {
  tenantId: 'tenant_123',
});
```

Environment variables use `FEATURE_` and map underscores to dots:

```bash
FEATURE_EXAMPLE_ROLLOUT=true
FEATURE_ROLLOUT_PERCENT=25
```

## Rules

- Default to disabled for incomplete product surfaces.
- Evaluate flags at the boundary of a use case, not deep inside domain helpers.
- Include `tenantId`/`userId` context for providers that support targeting.
- Remove stale flags once a feature is fully launched or cancelled.
