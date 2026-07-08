# fullstack-e2e

Path: `apps/e2e/fullstack`
Nx project: `fullstack-e2e`
Project type: `application`
Tags: `platform:e2e`, `type:e2e`, `scope:fullstack`

## Purpose

End-to-end app project for the fullstack scope.

## Ownership

- Keep app entrypoints, renderer/service composition, and app-local configuration in this project.
- Move reusable behavior into the owning `libs/**` project instead of sharing through another app.
- Keep this project focused on cross-app smoke and full-stack verification, not reusable product logic.

## Commands

```bash
pnpm exec nx run fullstack-e2e:e2e
```

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../AGENTS.md)
- [Repository architecture](../../../docs/architecture.md)
- [Command matrix](../../../docs/command-matrix.md)
- [Testing](../../../docs/testing.md)
