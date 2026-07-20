# AI agent workflows

These workflows keep repeatable agent procedures out of the always-loaded [AGENTS.md](../../AGENTS.md) and detailed [AI agent policy](agent-policy.md). Use the matching repo skill under `.agents/skills/**` when the agent runtime supports skills.

## Workflow selection

| Task                              | Use                                        | Read first                                                                     |
| --------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------ |
| PR or branch review               | `.agents/skills/pr-review/SKILL.md`        | `AGENTS.md`, `docs/ai/agent-policy.md`, changed files, project configs, tests  |
| CI failure triage                 | `.agents/skills/ci-triage/SKILL.md`        | failing job logs, workflow file, command matrix, local reproduction target     |
| Service or module audit           | `.agents/skills/service-audit/SKILL.md`    | owning app/library config, source, tests, API contracts, operations docs       |
| App, library, or feature scaffold | `.agents/skills/scaffold-feature/SKILL.md` | architecture, FSD, owning app/API, generator dry-run                           |
| Frontend UX or shared UI work     | `docs/agent-skills.md`                     | frontend app shell, shared UI libraries, Storybook/tests, design workflow docs |
| API contract change               | no separate skill yet                      | controller/DTO source, OpenAPI output, generated clients, API lifecycle docs   |
| Database migration change         | no separate skill yet                      | migration source, entity/repository source, migration docs, rollback checks    |

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

- Begin from the current branch, `origin/main`, and the exact files changed by the task.
- Read the closest source, tests, project config, and existing docs before editing.
- Prefer repository commands from [Command matrix](../command-matrix.md) and [Local verification](../local-verification.md).
- Keep findings tied to file paths, commands, and observed behavior.
- Do not invent compatibility shims or new docs sections when existing repo policy already covers the case.
- Do not use external AI coding assistants. Tool-specific instruction files must redirect to [AGENTS.md](../../AGENTS.md) instead of copying rules.

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
