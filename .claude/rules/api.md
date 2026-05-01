---
paths:
  - apps/api/**
---

# API Rules (NestJS + DDD)

Self-contained. Claude follows this when writing code under `apps/api/**`. Deeper rationale lives in `docs/architecture.md`.

The code block below is the copy-pasteable rule set — drop it into the target project's `.claude/rules/api.md` as-is.

---

```markdown
## Directory Layout

\`\`\`
src/
├── app/              # Framework wiring + project base
│   ├── base/         # Base classes: BaseAggregateRoot / DomainEvent / IntegrationEvent
│   ├── config/ database/ events/ filters/ interceptors/ middleware/ logger/
│   └── decorators/ validators/
├── modules/{ctx}/    # Business contexts
└── shared-kernel/    # Pure cross-context contracts
\`\`\`

### Dependency Direction

- `modules/` `domain/` MAY import `app/base/` (inheriting base classes)
- Other `modules/` layers MAY import `app/decorators/` / `app/validators/`
- `modules/` MUST NOT import other `app/` subdirectories (config / database / events and other wiring code)
- `app/` MUST NOT import `modules/`
- Contexts MUST NOT import each other (see "Cross-context communication" below for exceptions)
- `shared-kernel/` holds pure contracts only; MUST NOT import `modules/` / `app/`

## Domain Layer Purity

The domain expresses business semantics independently — neither framework nor infrastructure should pollute it.

- Source code MUST NOT contain `@Injectable` / `@nestjs/*` / runtime libraries (`ioredis` / `pino` / `bcrypt` / `date-fns`)
- Source code MAY import: this context's `domain/`, `app/base/`, `shared-kernel/`
- `*.spec.ts` uses `vitest` + domain classes only; MUST NOT use `Test.createTestingModule` — domain tests shouldn't need the NestJS container
- Aggregate root pattern: `load → aggregate.method() → repo.save()`; aggregates expose business methods (`pay` / `cancel` / `publish`); MUST NOT use field setters — setters let external code mutate state directly, bypassing business rules

When stuck: wanting to use an external library in the domain → that logic belongs in application or infrastructure; stop and move it out.

## Cross-Context Communication

Contexts communicate through explicit contracts and never import each other's implementations directly. The combination of NestJS DI and TypeScript `import type` makes this hold at both compile time and runtime:

- Interfaces imported via `import type` (erased at compile time, no runtime dependency)
- Implementations wired via `@Inject(X_TOKEN)` (only a Symbol constant exists at runtime, not the class)

### Communication Mechanisms

Pick the mechanism by communication intent:

- Need a return value (synchronous) → port + Symbol token: `@Inject(X_TOKEN)` + `import type { XPort }`
- Trigger a side effect (asynchronous) → domain event: `@OnEvent(XEvent.name)` + `import { XEvent }`

### DI Wiring Contract

NestJS DI fails to wire or breaks type isolation when violated in any of these three places:

1. Injection key MUST be `Symbol('NAME_TOKEN')`; MUST NOT use a class as the key — `emitDecoratorMetadata` forces a runtime import of the class, breaking type isolation
2. Interfaces MUST use `import type`; Symbol tokens use a regular `import` — runtime-importing an interface yields `undefined` and DI fails
3. MUST use constructor injection; MUST NOT use `@Optional()` / property injection — these break `new Service(...mocks)` in unit tests

### Where Cross-Context Imports Are Allowed

Only two locations:

- Cross-context shared contracts → through `shared-kernel/`
  - `import { X_TOKEN } from '@/shared-kernel/application/ports/...'` (Symbol constant, value)
  - `import type { XPort } from '@/shared-kernel/application/ports/...'` (interface, erased at compile time)
- Subscribing to another context's domain event → import the event class directly
  - `import { YEvent } from '@/modules/{ctx}/domain/events/...'` (pure data class; an event is an already-occurred fact, so subscribing creates no reverse coupling)

### Forbidden Imports and Patterns

- MUST NOT cross-context import another context's `services/` / `infrastructure/` / `{ctx}.module.ts`
- MUST NOT cross-context import another context's concrete Service class
- MUST NOT use `forwardRef()` to dodge circular dependencies — that's a signal the boundary is wrong
- MUST NOT have bidirectional event subscriptions (A subscribes to B, B subscribes to A) — also a signal the boundary is wrong

### `@Global()` Usage

Any module that exports tokens consumed across contexts MUST be marked `@Global()`. A module's `exports` may include both Service classes and TOKENs — the Service class for internal use within the context, the TOKEN for cross-context use.

When stuck: wanting to import a file from another context → check whether it's a `.port.ts` / `.event.ts` / `TOKEN` or a module/Service. The latter is forbidden. If unclear, stop and ask the user.

## External Side Effects Go Through Ports

Database, cache, external HTTP, message queues, file system, and HTTP entry/exit are isolated via ports — a Service should never know which database or HTTP library it uses, only an abstract port.

- Service constructors MUST NOT inject concrete clients: `@Inject(DrizzleService)` / `@Inject(Redis)` / `@Inject(HttpService)`
- Services MAY `import type { InsertX, X } from '@workspace/database'` (pure types only)
- Repository interface → `application/ports/`; implementation → `infrastructure/repositories/`
- External APIs → `application/ports/` + `infrastructure/adapters/`
- Controllers at stage 3+ MUST return DTOs (`XxxResponseDto` + explicit `fromDomain()` conversion); MUST NOT leak aggregate/entity. At stages 1–2 simple CRUD MAY return schema types directly (see progressive layering below)

When stuck: facing a new external side effect → "Can it be mocked? Can the implementation be swapped?" → use a port. If this context has no matching port, stop and ask the user before creating one.

## shared-kernel Admission

`shared-kernel` is the only channel for cross-context shared contracts. Strict admission control prevents it from devolving into a "throw everything in here" junk drawer.

Two admissible categories:

- Cross-context contracts: port interfaces, domain event classes (`extends DomainEvent`), global enums, generic DTO base classes, cross-context value objects (pure data classes)
- Framework-level base infrastructure: DTOs / decorators consumed only by `app/` global components (`problem-details.dto.ts`)

MUST NOT enter shared-kernel:

- Any context-specific business judgment
- Entities or domain services with business methods (e.g. `Order.canCancel()`)
- Runtime-mutable state (singletons, global variables)
- Utility functions (place in `app/utils/` or the originating context)

**When to admit**: move into shared-kernel when the second consumer appears.
**When to evict**: when consumers drop back to one, move it back to the publishing context.
**Rot warning**: shared-kernel port methods keep growing → split into multiple ports per consumer scenario (ISP); do not pile methods onto a fat port.

## Progressive Layering (Time Dimension)

Contexts start as the thinnest possible shell and level up only when signals appear. Don't force-fit DDD for "architectural consistency"; don't pre-create empty layers for "future extensibility".

| Stage | Structure | Signal to advance |
|---|---|---|
| 1 | presentation + infrastructure | Need persistent state |
| 2 | + application/ports + repositories | A non-trivial "read → judge → write" flow appears |
| 3 | + application/services | State transition rules, multi-field invariants, or need to publish domain events appear |
| 4 | + domain/aggregates + events | — |

- Default to stage 1 or 2 when starting. Don't create `domain/` or a Service shell when the user hasn't explicitly asked for DDD
- Skipping one stage is allowed; MUST NOT skip two stages (1→3, 2→4 — stop and ask the user)
- One-way upgrade only; MUST NOT downgrade
- At stage 2, Controllers MAY directly `@Inject(REPOSITORY_TOKEN)`

When stuck:

- Creating a new context → ask "Is there cross-request state?" to decide the starting stage
- Stage 2 needs a business judgment → upgrade to 3 first and add a Service
- Stage 3 needs a state machine → that's a stage-4 signal; stop and confirm whether to introduce an aggregate
- User says "drop the domain to simplify" → stop and ask why; downgrading loses business semantics

## Naming and Style

Backed by `oxlint` + `dependency-cruiser`. Claude doesn't need to memorize conventions before writing new files — fix on lint failure. See `.oxlintrc.json` / `.dependency-cruiser.cjs`.

Private fields use `#` syntax; absolute paths use the `@/*` alias; `import type` for pure type imports.
```
