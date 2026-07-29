# AI Agent Instructions

Always-loaded policy for human and AI contributors to
`nmime/nest-react-boilerplate`. Detailed workflow and architecture docs live in
[docs/ai/agent-policy.md](docs/ai/agent-policy.md) and
[docs/ai/repo-map.md](docs/ai/repo-map.md).

## Non-Negotiable Rules

- Work only in this repository unless a maintainer explicitly assigns another.
- Before edits, commits, pushes, or deployment work, verify the target repo,
  current branch, `HEAD`, and current `main` SHA.
- Use **Node.js >=24 <25** and pnpm 11.11.0; prefer Corepack and
  `pnpm install --frozen-lockfile`.
- Do not expose secrets, tokens, real `.env*` values, Docker secret files,
  credentials, or full environment dumps.
- Do not deploy, publish packages/images, rotate credentials, run destructive
  database commands, or spend funds unless a maintainer explicitly asks for that
  in the current task.
- Do not use Copilot, Copilor, Cursor, or any external AI coding assistant. Tool
  instruction files in this repo are redirect-only adapters to this policy.
- Read existing docs, configs, tests, and public APIs before editing. Keep
  changes scoped and avoid compatibility shims that contradict repo policy.
- Treat generated artifacts as read-only unless the task explicitly includes
  source changes plus regeneration.

## Branch And Authorship

- Preserve repository ownership with author and committer exactly
  `nmime <66474195+nmime@users.noreply.github.com>` for commits produced by
  repository agents. Do not rewrite legitimate human contributor identities.
- Configure author and committer explicitly before committing and verify with
  `git show --format=fuller --no-patch HEAD`.
- Do not add `Co-authored-by`, `Signed-off-by`, Splox, Executor, bot,
  automation, or assistant trailers.
- Do not force-push `main`; create focused topic branches from current `main`.
- Name topic branches `<type>/<kebab-case>` using `feat`, `fix`, `docs`,
  `chore`, `refactor`, `test`, `ci`, `perf`, `build`, `revert`, `release`, or
  `hotfix`. Never use `codex`, `claude`, or another assistant/vendor identity
  as a branch path segment.

## Layout Rules

- Frontend deployables live under `apps/frontend/**`.
- Backend deployables live under `apps/backend/<scope>/**`; this repo does not
  use a top-level `services/` tree.
- Backend libraries live under `libs/backend/**`, frontend libraries under
  `libs/frontend/**`, and cross-runtime libraries under `libs/common/**`.
- Repository tooling lives under `packages/tooling/**`.
- Public path aliases in `tsconfig.base.json` are stable API. Do not rename,
  remove, or repoint aliases unless the task explicitly includes migration work.
- Application selection is explicit and repeatable: use `pnpm nrb setup` for
  interactive choices or `pnpm nrb setup --app <id>` to add later. Never invent
  a default app or bypass `.nrb/workspace.json` with an implicit all-app fallback.

## Runtime Stack

- **Node.js >=24 <25**, pnpm, TypeScript, Nx monorepo.
- **Backend**: NestJS on Fastify, selectable PostgreSQL + MikroORM or native
  MongoDB persistence, Redis, NATS.
- **Frontend**: Vite (React SPAs), Astro (landing), Vike (SSR), Expo (React Native).

## Scaffolding Workflow

- For any new app, library, or vertical feature, read
  [`.agents/skills/scaffold-feature/SKILL.md`](.agents/skills/scaffold-feature/SKILL.md)
  and the canonical
  [Scaffolding and Extension Contract](docs/scaffolding-and-extension.md)
  before editing project structure.
- Use `pnpm nrb add ... --dry-run` first. Do not copy an existing app directory
  or reproduce the reference `admin-app` / `user-app` product UI.
- Inspect the Nx project graph, setup catalog, nearest `AGENTS.md`, and owning
  routes/modules before generating. If the requested behavior belongs to an
  existing app, library, or feature, modify that owner in place; `pnpm nrb add`
  is only for genuinely new ownership. Never create an adjacent clone, `-new`,
  `-v2`, `starter-app`, or nested copy of this boilerplate as a workaround.
- `pnpm nrb add --force` and direct feature regeneration are forbidden. Modify
  existing product code in place; app, library, and feature roots are never
  overwritten by generators.
- No deployable is the repository's default application. Admin, user, landing,
  site, mobile, API, consumer, scheduler, and newly generated apps keep separate
  product/runtime ownership; do not invent an additional generic deployable.
- Generated roots include their own `AGENTS.md` and `README.md`; read the nearest
  versions before completing product-specific routing, contracts, persistence,
  authorization, and tests.

## Request Context (CLS)

The backend uses Node `AsyncLocalStorage` (zero external dependencies) to carry
per-request context through the entire async call stack.

- **ClsInterceptor** runs first globally. On each request it enters a CLS
  context and generates a `requestId`.
- All backend code reads from the same async context:

  ```ts
  import { requestContext } from '@app/backend-common-bootstrap';
  const id = requestContext.getRequestId();
  ```

- The same `requestId` flows through filters, interceptors, guards, services,
  controllers, and middleware — guaranteed by async context propagation. No
  manual threading of request identifiers is needed.

## Exception System (RFC 9457 — Problem Details)

All API errors conform to RFC 9457 (`application/problem+json`). Internal
`HttpException.message` is **never** exposed to clients.

- **Exception factory** creates typed exceptions at class definition time:

  ```ts
  Exception({ name, kind, problemType, status, extensionsType });
  ```

- Custom `problemType` values must exist in `@app/common-problem-details`; the
  registry owns their URI, title, status, safe default detail, documentation,
  and allowed extensions. Omit `problemType` for generic `about:blank` errors.
- Runtime context (passed to the constructor) carries only:
  - `extensions?` — explicit problem-type-specific public members
  - `meta?` — private diagnostics for logging/telemetry only
  - `cause?` — underlying error for stack traces
- **Domain exceptions**: `ResourceNotFoundException`, `UnauthorizedException`,
  `ForbiddenException`, `ConflictException`, `BadRequestException`,
  `InternalException`.
- **Validation**: `ClientDataValidationException` with typed `ValidationErrorInfo`.
- Problem `type` values use `problemTypeForCode()` and the product-owned
  `https://<root-domain>/problems#<code>` namespace. Never place repository,
  package, template, or runtime host names in public problem identifiers.
- Response content type is always `application/problem+json`.
- The body `status` always equals the HTTP status. `instance` is an absolute,
  opaque occurrence URI derived from the validated request ID. Localization
  changes standard `title`/`detail` members and sets `Content-Language`.

## Read Next

- Full agent policy: [docs/ai/agent-policy.md](docs/ai/agent-policy.md)
- Retrieval map: [docs/ai/repo-map.md](docs/ai/repo-map.md)
- Retrieval policy: [docs/ai/retrieval-policy.md](docs/ai/retrieval-policy.md)
- Agent workflows and skills: [docs/ai/agent-workflows.md](docs/ai/agent-workflows.md), [docs/agent-skills.md](docs/agent-skills.md)
- Documentation index: [docs/README.md](docs/README.md)
- Architecture: [docs/architecture.md](docs/architecture.md)
- Project catalog: [docs/project-catalog.md](docs/project-catalog.md)
- Commands: [docs/command-matrix.md](docs/command-matrix.md)
- Local verification: [docs/local-verification.md](docs/local-verification.md)
- Single-server operations: [docs/single-server-deployment.md](docs/single-server-deployment.md)
- Testing: [docs/testing.md](docs/testing.md)

## Validation

Pick the smallest command set that proves the change, then broaden when touching
shared/public APIs. Always run `git diff --check`; for docs, run Prettier on the
touched Markdown when dependencies are available.

Run `pnpm agent:verify` when setup, generators, ownership rules, or agent-facing
scaffolding guidance changes. It exercises repeatable setup plus the executable
in-place-first application, library, and feature guards.
