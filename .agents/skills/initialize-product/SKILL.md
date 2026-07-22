---
name: initialize-product
description: Initialize, select, and verify a product workspace with the repository CLI. Use when running nrb init or setup, changing selected applications, preparing local infrastructure, or diagnosing an incomplete workspace bootstrap.
---

# Initialize a product workspace

## Read first

- Read `../../../AGENTS.md`, `../../../docs/setup/cli-reference.md`, and `../../../docs/project-catalog.md`.
- Inspect `.nrb/workspace.json`, the setup catalog, and current `pnpm nrb doctor --json` output. Never infer a default application.

## Workflow

1. Verify the repository, branch, `HEAD`, current `main`, Node 24, pnpm 11.11, and working-tree ownership.
2. Use `pnpm nrb init` only for an uninitialized workspace. Use `pnpm nrb setup` or `pnpm nrb setup --app <id>` for explicit application selection.
3. Review the dry-run or plan before accepting file changes. Preserve existing selections and user configuration.
4. Keep secrets as documented placeholders. Never reveal, synthesize, or commit credentials.
5. Start only the infrastructure required by selected applications, apply development migrations, and run onboarding commands from the CLI reference.
6. Run `pnpm nrb doctor --json` again and validate the selected projects with the narrowest build or smoke targets.

## Completion contract

Report selected applications, configuration written, infrastructure or migrations run, verification results, and blockers. Initialization does not authorize deployment, DNS, credential creation, or public exposure.
