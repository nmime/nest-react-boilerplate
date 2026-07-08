# Service Incident Runbook Template

Use this template when creating a service-specific incident runbook under
`docs/runbooks/`.

## Scope

- Service:
- Owning app path:
- Primary dashboards/logs:
- Customer impact:

## First Checks

1. Verify the deployed version, environment, and rollout status.
2. Check `/live`, `/ready`, `/health`, and `/health/private` where the service
   exposes them.
3. Inspect recent logs for the first real error, not only restart cascades.
4. Confirm database, queue, cache, and upstream dependencies that the service
   actually uses.

## Mitigation

Document the safest reversible mitigation first. Include exact commands only
when they are approved operational commands for this repository.

## Recovery

Document how to restore normal service, validate the fix, and confirm customer
impact has ended.

## Follow-Up

- Source changes needed:
- Tests or monitors needed:
- Docs/runbooks to update:
