# DDD and Clean Architecture foundation

This repository is moving toward domain-driven design (DDD) with Clean Architecture boundaries. This document defines the target dependency rules for new vertical slices and for future migrations of existing features. It is intentionally policy-only for this foundation slice; existing feature and domain source code remains unchanged.

## Dependency direction

Dependencies must point inward toward the domain model:

```text
apps / composition root
  -> interfaces / presentation
    -> infrastructure
      -> application
        -> domain
```

The domain layer does not depend on any outer layer. Application code depends on the domain and on ports it owns or explicitly declares. Infrastructure and presentation adapt external systems to those ports. Nest modules and deployable apps are composition roots that wire concrete implementations.

## Target layers

### Domain

Domain libraries contain the business model for a bounded context:

- entities and aggregates;
- value objects;
- domain services;
- domain events;
- repository ports and other domain-owned ports when they express ubiquitous language.

Domain code must not import NestJS, database clients, ORM decorators, HTTP clients, controllers, DTOs, process environment helpers, queues, logging frameworks, or other framework/runtime adapters. Domain tests should run without application bootstrapping or network/database fixtures.

### Application

Application libraries orchestrate use cases and transactions for a bounded context:

- commands, queries, handlers, and use cases;
- application services;
- application-owned ports for external systems;
- transaction boundaries and unit-of-work abstractions;
- validation of use-case input when it is business/application validation rather than transport validation.

Application code may depend on domain code and declared ports only. It must not depend directly on controllers, resolvers, bot handlers, database implementation modules, generated ORM entities, HTTP clients, or Nest application modules.

### Infrastructure

Infrastructure libraries implement adapters for application and domain ports:

- database mappings and repository implementations;
- external service clients;
- queue/event bus adapters;
- cache/object-storage/search adapters;
- migrations and persistence-specific integration helpers.

Infrastructure code may depend inward on application/domain contracts and outward on framework SDKs as needed. It must not contain use-case orchestration or presentation DTO mapping logic.

### Interfaces / presentation

Interfaces libraries translate transports into application use cases:

- HTTP controllers;
- GraphQL resolvers;
- bot handlers;
- request/response DTOs;
- transport-specific mappers and presenters.

Presentation code may depend on application ports/use cases and transport frameworks. It must not bypass application use cases to call repositories or infrastructure adapters directly except for explicit health/readiness endpoints whose policy is documented.

### Composition root

Composition roots wire implementations to ports and configure runtime modules:

- Nest modules that bind providers;
- deployable apps under `apps/**`;
- bootstrap/runtime configuration.

Composition roots may reference all layers that they assemble. They are the only place where a vertical slice should couple a transport adapter, use case, transaction adapter, repository implementation, and external runtime configuration.

## Shared kernel and contracts

Shared code is allowed only when it has a stable cross-context purpose:

- **Shared kernel**: small, stable primitives that multiple bounded contexts truly share, such as common value-object helpers, result types, or framework-neutral utilities.
- **Contracts**: API/event schemas that define boundaries between producers and consumers. Contracts must not import backend or frontend runtime implementation details.
- **Runtime common libraries**: backend or frontend helper libraries that are shared within one runtime. These are not a substitute for a bounded-context domain model.

Avoid placing business rules in shared libraries merely to make imports convenient. If a rule belongs to one bounded context, keep it in that context and expose it through a port, use case, or contract.

## Migration plan

1. Establish the naming policy and additive canonical TypeScript aliases while preserving existing aliases for compatibility.
2. For each bounded context, identify current modules, contracts, persistence adapters, and presentation adapters.
3. Introduce layer folders/projects for `domain`, `application`, `infrastructure`, and `interfaces` only when changing that context for feature work or a dedicated migration.
4. Move dependencies inward one use case at a time, adding regression tests around the migrated behavior.
5. Update imports to canonical aliases after the destination layer is stable.
6. Remove temporary compatibility aliases only after all imports and generator templates have been migrated and validated.

## Foundation-slice non-goals

This foundation slice does not move code between layers, change application behavior, alter deployable apps, or remove legacy aliases. It only documents the target architecture and adds safe alias compatibility for future slices.
