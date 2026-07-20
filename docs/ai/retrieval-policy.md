# AI retrieval policy

This policy defines how agents should gather repository context before answering, editing, or reviewing.

## Default retrieval path

1. Load [AGENTS.md](../../AGENTS.md).
2. Load [AI agent policy](agent-policy.md) for non-trivial implementation, review, CI, docs, release, or generated-artifact work.
3. Check the current branch, target branch, and `origin/main` state when the task involves edits, review, commits, pushes, or deployment.
4. Read the files named by the user.
5. Read the nearest project config, package config, tests, and existing docs for the touched surface.
6. Use [AI repo map](repo-map.md) to find adjacent architecture, testing, operations, and API docs.
7. Verify claims through source, tests, generated artifacts, or current external primary sources when the answer depends on changing facts.

## Task-specific retrieval additions

### Error handling and exceptions

When the task involves throwing errors, handling exceptions, or reviewing error responses:

1. Read [agent-policy.md § Exception System](agent-policy.md#exception-system-rfc-9457) for the
   canonical import path (`@app/backend-common-exception`), the `Exception` factory signature,
   available domain classes, and anti-patterns.
2. Read `libs/backend/common/exception/lib` source to verify current exports.
3. Check existing error-handling tests in the affected project for expected RFC 9457 response shapes.

### Request context and correlation

When the task involves request-scoped data, correlation IDs, or tracing:

1. Read [agent-policy.md § Request Context](agent-policy.md#request-context-cls) for the
   canonical import path (`@app/backend-common-bootstrap`) and `requestContext` API.
2. Read `libs/backend/common/request-context/lib` source to verify current `requestContext` exports (bootstrap re-exports it via `@app/backend-common-bootstrap`), and the global CLS interceptor (`ClsInterceptor`) in `libs/backend/common/bootstrap/lib` that binds it to the async scope.

## What belongs where

| Context type                           | Location                                                      |
| -------------------------------------- | ------------------------------------------------------------- |
| Always-on repository policy            | `AGENTS.md`                                                   |
| Detailed AI coding policy              | `docs/ai/agent-policy.md`                                     |
| Human setup and product overview       | `README.md`, `CONTRIBUTING.md`                                |
| Topic-specific durable guidance        | `docs/**`                                                     |
| Agent context model                    | `docs/ai/**`                                                  |
| Repeatable multi-step agent procedures | `.agents/skills/**`                                           |
| Project ownership/setup notes          | nearest app/library/package `README.md`                       |
| Subtree-specific durable agent rules   | nearest `AGENTS.md`, only when justified                      |
| Personal local recall                  | local agent memory, never required for repository correctness |
| Mechanical enforcement                 | tooling, tests, CI, hooks, and static checks                  |

## External retrieval

Use internet research only when the task depends on current or external facts, such as package behavior, framework docs, cloud provider behavior, security advisories, or product documentation. Prefer primary sources and cite links in the answer or repo doc.

Do not paste secrets, environment dumps, private tokens, or full CI logs into external systems.

## Conflict handling

- User instructions for the current task override checked-in guidance unless they ask for unsafe, destructive, or policy-violating behavior.
- Closer path-specific `AGENTS.md` files override broader root rules only for that subtree.
- When two repo docs conflict, verify source and tests, then update or report the stale doc. Do not silently choose the easier instruction.
- Do not rely on local memory for required team policy; put durable team policy in checked-in docs.

## Retrieval anti-patterns

- Reading every Markdown file before a small targeted change.
- Duplicating `AGENTS.md` or `docs/ai/agent-policy.md` content into tool-specific files.
- Adding nested `AGENTS.md` files for generic reminders instead of path-specific app/library/package rules.
- Treating README prose as proof when source or tests disagree.
- Using stale generated OpenAPI/client output as the only source of truth.
- Importing non-existent types (`AppHttpException`, `BaseExceptionInput`, `ProblemDetailsInput`) instead of reading the exception library source.
- Adding `nestjs-cls` or other CLS packages when `@app/backend-common-bootstrap` already provides request context.
