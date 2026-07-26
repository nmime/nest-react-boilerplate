# AI retrieval policy

This policy defines how agents should gather repository context before answering, editing, or reviewing.

## Default retrieval path

1. Load [AGENTS.md](../../AGENTS.md).
2. Load [AI agent policy](agent-policy.md) for non-trivial implementation, review, CI, docs, release, or generated-artifact work.
3. Check the current branch, target branch, and `origin/main` state when the task involves edits, review, commits, pushes, or deployment.
4. Read the files named by the user.
5. Read the nearest project config, package config, tests, and existing docs for the touched surface.
6. For observable behavior, read the owning
   `openspec/specs/<capability>/spec.md`, its version 2 `verification.yaml`, and
   any active change before implementation or review.
7. Use [AI repo map](repo-map.md) to find adjacent architecture, testing, operations, and API docs.
8. Verify claims through source, tests, generated artifacts, or current external primary sources when the answer depends on changing facts.

### Specification-driven behavior

1. Use `$specify-behavior` when intent, invariants, ownership, or evidence is new
   or changing.
2. Use `$implement-specified-change` once the requirement and design are
   approved.
3. Read the complete executable-test inventory through `pnpm run spec:trace`
   instead of treating individual test discovery as proof of full coverage.
4. Use `$review-specification-assurance` to challenge omitted scenarios and
   verify exact-SHA evidence independently.

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

### Frontend planning, design, development, and quality

1. Select the exact deployable and renderer from the project catalog; no frontend is the default.
2. Read the nearest frontend `AGENTS.md`, README, project config, routes/screens,
   public UI exports, tests, and the frontend architecture/UX docs in the repo map.
3. Use `$plan-frontend-change` for cross-owner scope, `$design-frontend-experience`
   for new UX or visual direction, the matching web/native development skill for
   implementation, and `$validate-frontend-quality` for risk-based proof.
4. Verify responsive browser UI separately from Expo/React Native behavior and
   verify app routing/providers/auth/API flows separately from Storybook compositions.

### Backend planning, development, and quality

1. Select the exact API, consumer, scheduler, or reusable library owner from the
   project catalog; no backend deployable is the default.
2. Read the nearest backend `AGENTS.md`, README, project config, composition
   root, domain/persistence source, contracts, tests, and operations guidance.
3. Use `$plan-backend-change` for cross-owner scope, the matching API/process
   development skill for implementation, boundary skills for contracts, auth,
   database, or notifications, and `$validate-backend-quality` for risk-based proof.
4. Verify mocked/unit behavior separately from real infrastructure integration,
   runtime e2e, controlled external canaries, and deployment evidence.

### Documentation and agent guidance

1. Start at the [Documentation index](../README.md), then follow the topical
   owner or nested index. Do not scan every Markdown file for a narrow change.
2. Use `$maintain-documentation` when changing durable guidance, README/AGENTS
   routing, commands, runbooks, ADRs, or skill catalogs.
3. Keep every document reachable from the documentation index and every skill
   represented in both the skill catalog and workflow selector.
4. Run `pnpm run docs:check`, plus `pnpm run agent:verify` when agent behavior changes.

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
