# AI agent workflows

These workflows keep repeatable agent procedures out of the always-loaded [AGENTS.md](../../AGENTS.md) and detailed [AI agent policy](agent-policy.md). Use the matching repo skill under `.agents/skills/**` when the agent runtime supports skills.

## Workflow selection

| Task                                   | Use                               | Primary owner to inspect                             |
| -------------------------------------- | --------------------------------- | ---------------------------------------------------- |
| Specify new or changed behavior        | `$specify-behavior`               | OpenSpec capability, owners, current source/tests    |
| Implement approved behavior            | `$implement-specified-change`     | active change, durable spec, sidecar, project owners |
| Audit requirement and evidence quality | `$review-specification-assurance` | spec, sidecar, diff, exact-SHA dossier               |
| Initialize or select applications      | `$initialize-product`             | setup catalog and `.nrb/workspace.json`              |
| Update a downstream boilerplate base   | `$update-boilerplate-base`        | Git ancestry, upstream tag, product-owned changes    |
| Add a new app, library, or feature     | `$scaffold-feature`               | Nx graph, generator dry-run, target owners           |
| Change a generator                     | `$maintain-generators`            | schema, implementation, templates, tests             |
| Integrate an optional capability       | `$activate-capability`            | setup catalog and target composition roots           |
| Plan multi-owner backend work          | `$plan-backend-change`            | deployable, domain, contracts, data, runtime tests   |
| Plan multi-owner frontend work         | `$plan-frontend-change`           | selected app, routes, slices, UI, contracts, tests   |
| Define frontend UX or visual direction | `$design-frontend-experience`     | app surface, tokens, shared web/native UI            |
| Match an external visual reference     | `$design-from-reference`          | brand/site/DESIGN.md reference, tokens, primitives   |
| Build an HTTP API                      | `$develop-backend-api`            | backend deployable and domain library                |
| Build a consumer or scheduler          | `$develop-background-process`     | process entrypoint and job/event owner               |
| Build Vite, Astro, or Vike UI          | `$develop-web-frontend`           | frontend deployable, feature slice, web UI           |
| Build Expo or native UI                | `$develop-mobile-frontend`        | mobile deployable and native UI library              |
| Add or research shared web UI source   | `$shadcn-ui`                      | approved registry, `@app/frontend-ui-web`, Storybook |
| Change a public API contract           | `$change-api-contract`            | controller/DTO, OpenAPI, clients, consumers          |
| Change database shape or data          | `$migrate-database`               | entity, repository, migrations, integration tests    |
| Change auth, tenant, or RBAC behavior  | `$change-auth-access`             | auth/access libraries and protected resources        |
| Add a notification delivery path       | `$extend-notifications`           | event, template, provider, scheduler, consumer       |
| Change translated copy                 | `$change-i18n`                    | owning locale catalog and rendered consumers         |
| Add or change repository commands      | `$maintain-repo-tooling`          | tooling CLI registry, command, tests, docs           |
| Prepare runtime configuration          | `$prepare-deployment`             | selected app Docker/Helm/GitOps/operations files     |
| Upgrade packages                       | `$upgrade-dependencies`           | owning manifest, lockfile, all consumers             |
| Prove backend delivery quality         | `$validate-backend-quality`       | backend owners, contracts, infrastructure, e2e       |
| Prove frontend delivery quality        | `$validate-frontend-quality`      | frontend owners, Storybook, app/native e2e           |
| Select completion checks               | `$validate-change`                | diff owners, project targets, command matrix         |
| Change repository documentation        | `$maintain-documentation`         | canonical source, docs index, retrieval routes       |
| Review a branch or PR                  | `$pr-review`                      | changed source, tests, contracts, generated policy   |
| Diagnose CI                            | `$ci-triage`                      | first failing job, workflow, local equivalent        |
| Audit a project                        | `$service-audit`                  | config, source, contracts, tests, operations docs    |

For behavior changes, start with `$specify-behavior`, inspect the owning
`openspec/specs/<capability>/spec.md` and version 3 `verification.yaml`, then
classify each requirement as Cucumber `acceptance` or justified
`not-applicable` before implementing through `$implement-specified-change`.
Every executable test file must contain a `// @requirements REQ-...` marker
whose requirements own its Nx project. Finish with
`$review-specification-assurance`, `pnpm run spec:validate`, and the impacted
evidence lane. See [Specification assurance](../specification-assurance.md).

## Error handling and exception workflows

When adding or changing error handling in backend code:

1. **Read first**: [Agent policy: Exception System](agent-policy.md#exception-system-rfc-9457) and the source of `libs/backend/common/exception/lib`.
2. **Prefer domain exceptions** over raw `Exception` construction when a matching class exists:
   - `ResourceNotFoundException` (404), `UnauthorizedException` (401), `ForbiddenException` (403),
     `ConflictException` (409), `BadRequestException` (400), `InternalException` (500).
3. **Use the `Exception` class factory** for domain-specific errors that don't have a pre-built class:
   ```ts
   import { Exception, ExceptionKind } from '@app/backend-common-exception';

   export class PaymentFailedException extends Exception({
     name: 'PaymentFailedError',
     kind: ExceptionKind.Client,
     problemType: 'payment-failed',
   }) {}

   throw new PaymentFailedException({ meta: { provider: 'example' } });
   ```
4. Add `payment-failed` to `ProblemTypeDefinitions` in `@app/common-problem-details` first. The registry owns the custom URI, title, status, safe default detail, resolution, and allowed public extensions. Use `about:blank` instead when only HTTP status semantics are needed.
5. **Do not create** `AppHttpException`, `BaseExceptionInput`, or `ProblemDetailsInput` — these types
   do not exist in the codebase.
6. Verify the HTTP/body status invariant, resolved `/problems#<code>` identity, occurrence URI, localization headers, redaction, and `application/problem+json` media type.

## Request context (CLS) workflows

When adding request-scoped data (correlation IDs, user context, tracing):

1. **Read first**: [Agent policy: Request Context](agent-policy.md#request-context-cls) and the source of `libs/backend/common/request-context/lib` (re-exported by `libs/backend/common/bootstrap/lib`).
2. **Always use** `requestContext` from `@app/backend-common-bootstrap`:
   ```ts
   import { requestContext } from '@app/backend-common-bootstrap';

   const requestId = requestContext.getRequestId();
   requestContext.set('userId', userId);
   const userId = requestContext.get('userId');
   ```
3. **Do not add** `nestjs-cls`, `cls-hooked`, or any third-party CLS package — the project uses Node's built-in `AsyncLocalStorage`.
4. **Do not manually instantiate** `AsyncLocalStorage` — the global CLS interceptor (`ClsInterceptor`) registered during bootstrap manages the storage lifecycle.

## Common workflow rules

- Invoke only the smallest set of matching skills. Chain skills when ownership
  crosses a real boundary, such as `$develop-backend-api` followed by
  `$change-api-contract` and `$validate-change`.
- Route observable behavior through `$specify-behavior` and
  `$implement-specified-change`; include `$review-specification-assurance` in
  independent review. A source-only refactor may keep existing requirements and
  evidence when behavior is unchanged.
- For substantial frontend work, use `$plan-frontend-change`, add
  `$design-frontend-experience` only when UX or visual direction changes,
  start from `$design-from-reference` when the direction is anchored to a
  real-world example, implement with the matching web/native skill, and finish
  with `$validate-frontend-quality`.
- For substantial backend work, use `$plan-backend-change`, implement with the
  matching API/process skill, chain contract/auth/database/notification skills
  only for changed boundaries, and finish with `$validate-backend-quality`.
- Begin from the current branch, `origin/main`, and the exact files changed by the task.
- Read the closest source, tests, project config, and existing docs before editing.
- Prefer repository commands from [Command matrix](../command-matrix.md) and [Local verification](../local-verification.md).
- Keep findings tied to file paths, commands, and observed behavior.
- Do not invent compatibility shims or new docs sections when existing repo policy already covers the case.
- Do not use external AI coding assistants. Tool-specific instruction files must redirect to [AGENTS.md](../../AGENTS.md) instead of copying rules.
- Run `pnpm run agent:skills:check` after changing a skill package. Run
  `pnpm run agent:verify` when skills, setup, generators, ownership rules, or
  agent-facing scaffolding guidance change.

## Output expectations

For implementation work, report:

- files changed
- behavior changed
- validation actually run
- blockers or skipped checks with concrete reasons

For review work, report:

- findings first, ordered by severity
- exact file/line references where practical
- missing tests or residual risk
- a short summary only after findings

Never require magic completion markers. A normal final status with changed files and verification evidence is enough.
