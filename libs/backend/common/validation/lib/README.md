# @app/backend-common-validation

## Purpose

Builds the shared Nest validation pipe and converts DTO validation failures
into typed RFC 9457 errors with JSON Pointer field details.
The `client-data-validation` type exposes only `errors[]` entries shaped as
`{ detail, pointer }`; pointers are URI fragments such as `#/profile/email`.

## Commands

```bash
pnpm exec nx run @app/backend-common-validation:build
pnpm exec nx run @app/backend-common-validation:test
```

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../../AGENTS.md)
- [Repository architecture](../../../../../docs/architecture.md)
- [Command matrix](../../../../../docs/command-matrix.md)
- [Testing](../../../../../docs/testing.md)
- [API contracts](../../../../../docs/api-contracts.md)
