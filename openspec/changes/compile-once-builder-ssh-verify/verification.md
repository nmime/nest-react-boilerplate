## Evidence Policy

`REQ-RUNTIME-DELIVERY-009` stays operations + security. Cucumber remains
not-applicable: this is operational compile and host-inspection behavior.

## Requirement Evidence

| Requirement                | New evidence                                                                                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `REQ-RUNTIME-DELIVERY-009` | `scripts/build-images.spec.mjs` builder-stage assertion; `scripts/validate-deployment-config.mjs`; `scripts/verify-single-server-ssh.spec.mjs` |

## Lanes

- PR/main: `pnpm run test:scripts` covering the new SSH and builder tests.
- Live SSH against a real VPS is opt-in and is not a merge gate.
