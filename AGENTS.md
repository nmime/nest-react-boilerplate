# AI Agent Instructions

This is the short always-loaded policy for AI coding agents in
`nmime/nest-react-boilerplate`. The fuller policy and workflow details live in
[docs/ai/agent-policy.md](docs/ai/agent-policy.md) and
[docs/ai](docs/ai/repo-map.md).

## Non-Negotiable Rules

- Work only in this repository unless a maintainer explicitly assigns another
  repository.
- Before edits, commits, pushes, or deployment work, verify the target repo,
  current branch, `HEAD`, and current `main` SHA.
- Use Node.js `>=26 <27` and pnpm `11.10.0`; prefer Corepack and
  `pnpm install --frozen-lockfile`.
- Do not expose secrets, tokens, real `.env*` values, Docker secret files,
  credentials, or full environment dumps.
- Do not deploy, publish packages/images, rotate credentials, run destructive
  database commands, or spend funds unless a maintainer explicitly asks for that
  in the current task.
- Do not use Copilot, copilor, Cursor, or any external AI coding assistant. Tool
  instruction files in this repo are redirect-only adapters to this policy.
- Read existing docs, configs, tests, and public APIs before editing. Keep
  changes scoped and avoid compatibility shims that contradict repo policy.
- Treat generated artifacts as read-only unless the task explicitly includes
  source changes plus regeneration.

## Branch And Authorship

- Preserve repository ownership with author and committer exactly
  `nmime <66474195+nmime@users.noreply.github.com>` when committing.
- Configure author and committer explicitly before committing and verify with
  `git show --format=fuller --no-patch HEAD`.
- Do not add `Co-authored-by`, `Signed-off-by`, Splox, Executor, bot,
  automation, or assistant trailers.
- Do not force-push `main`; create focused topic branches from current `main`.

## Layout Rules

- Frontend deployables live under `apps/frontend/**`.
- Backend deployables live under `apps/backend/<scope>/**`; this repo does not
  use a top-level `services/` tree.
- Backend libraries live under `libs/backend/**`, frontend libraries under
  `libs/frontend/**`, and true cross-runtime libraries under `libs/common/**`.
- Repository tooling lives under `packages/tooling/**`.
- Public path aliases in `tsconfig.base.json` are stable API. Do not rename,
  remove, or repoint aliases unless the task explicitly includes migration work.

## Read Next

- Full agent policy: [docs/ai/agent-policy.md](docs/ai/agent-policy.md)
- Retrieval map: [docs/ai/repo-map.md](docs/ai/repo-map.md)
- Architecture: [docs/architecture.md](docs/architecture.md)
- Commands: [docs/command-matrix.md](docs/command-matrix.md)
- Local verification: [docs/local-verification.md](docs/local-verification.md)
- Testing: [docs/testing.md](docs/testing.md)

## Validation

Pick the smallest command set that proves the change, then broaden when touching
shared/public APIs. Always run `git diff --check`; for docs, run Prettier on the
touched Markdown when dependencies are available.
