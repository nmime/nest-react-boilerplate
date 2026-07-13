# Backend Library Instructions

Follow [library instructions](../AGENTS.md), the root [AGENTS.md](../../AGENTS.md),
and [AI agent policy](../../docs/ai/agent-policy.md).

## Backend Library Rules

- Do not import frontend libraries from backend libraries.
- Keep NestJS app composition in `apps/backend/**`; reusable modules, ports,
  adapters, validation, health, logging, and persistence belong in backend
  libraries.
- Put shared backend runtime dependencies in `libs/backend/package.json`, not
  individual library package manifests.
- Keep controller/DTO API shape source-backed and regenerate contracts through
  repo tooling when API shape changes.

## Request Context (CLS)

- Backend libraries may read request-scoped data via CLS:

  ```ts
  import { requestContext } from '@app/backend-common-bootstrap';
  const id = requestContext.getRequestId();
  ```

- Never store request data as class fields or method arguments — always read
  from the async context.

## Exception System

- Throw typed domain exceptions from `@app/backend-common-exception`:
  `ResourceNotFoundException`, `UnauthorizedException`, `ForbiddenException`,
  `ConflictException`, `BadRequestException`, `InternalException`.
- Every exception returns `application/problem+json` per RFC 9457. Never
  expose `HttpException.message` to clients.
