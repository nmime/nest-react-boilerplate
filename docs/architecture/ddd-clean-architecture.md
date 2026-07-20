# DDD and Clean Architecture boundaries

This repository applies domain-driven design and Clean Architecture boundaries
incrementally. Auth and admin already use `domain`, `application`,
`infrastructure`, and `interfaces` folders where those roles are real; shared
backend projects also carry enforced `boundary:*` tags. This document defines
the dependency contract for new work and the remaining migration direction. It
does not claim that every existing feature has been split into four projects.

## Dependency direction

Dependencies must point inward toward the domain model:

```text
interfaces / presentation ---> application ---> domain
infrastructure / adapters ---> application-owned ports
infrastructure / adapters ---------------------> domain
apps / composition roots wire the outer layers
```

The domain layer does not depend on any outer layer. Application code depends on the domain and on ports it owns or explicitly declares. Infrastructure and presentation adapt external systems to those ports. Nest modules and deployable apps are composition roots that wire concrete implementations.

## Layer contracts

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

## Incremental adoption

1. For each bounded context, identify current modules, contracts, persistence
   adapters, and presentation adapters.
2. Introduce a layer folder or project only when it owns real behavior; do not
   create empty architecture shells.
3. Move dependencies inward one use case at a time, adding regression tests
   around the migrated behavior.
4. Prefer application/domain-owned ports when changing code that currently
   injects a concrete persistence adapter.
5. Keep canonical aliases, Nx tags, ESLint constraints, generator templates,
   and local README/AGENTS guidance aligned with the resulting boundary.

## Current adoption status

- Auth main has domain, application, infrastructure, and HTTP-interface folders;
  its PostgreSQL implementation remains in the feature-owned data-access
  project.
- Admin main separates domain, application, and HTTP interfaces, while its
  persistence implementations live in the auth PostgreSQL project.
- User main keeps thin HTTP composition while reusable user domain/application
  contracts live in user shared.
- Backend common libraries use `boundary:backend-kernel`,
  `boundary:infrastructure-adapter`, `boundary:interface-helper`, and
  `boundary:test-util` tags enforced by `eslint.config.js`.

Some existing application services still consume concrete repository classes
through composition-time injection. Treat that as an incremental migration
boundary, not evidence that interface code may bypass use cases or that domain
code may import infrastructure.
