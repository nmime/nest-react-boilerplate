## Evidence Policy

Critical/high requirements require a product owner distinct from the
verification owner. Domain profiles use owning Vitest suites; API profiles use
provider/consumer contract commands; async and persistence profiles use
component or Testcontainers evidence; security and operations profiles use
their dedicated repository commands; stakeholder examples remain Cucumber or
Playwright. Inventory annotations are trace links, not substitutes for the
selected high-signal evidence below.

## Requirement Evidence

| Requirement                      | Risk     | Required evidence               | Repository owners                                                                                        |
| -------------------------------- | -------- | ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `REQ-ASSURANCE-INVENTORY-004`    | critical | tooling, documentation          | `@repo/tooling: packages/tooling/src/commands/spec/assurance.test.ts`; `docs/specification-assurance.md` |
| `REQ-ASSURANCE-WORKFLOW-005`     | high     | tooling, documentation          | `packages/tooling/scripts/validate-agent-skills.spec.mjs`; `.agents/skills/**`                           |
| `REQ-ASSURANCE-OWNERSHIP-006`    | critical | tooling                         | `@repo/tooling: packages/tooling/src/commands/spec/assurance.test.ts`                                    |
| `REQ-SCAFFOLD-GENERATORS-003`    | high     | tooling, domain                 | `@repo/tooling: packages/tooling/src/generators/**`                                                      |
| `REQ-SCAFFOLD-INIT-004`          | high     | tooling, domain                 | `@repo/tooling: packages/tooling/src/commands/project/init-project.test.ts` and setup tests              |
| `REQ-SCAFFOLD-TOOLING-005`       | high     | tooling, domain                 | `@repo/tooling:test`; `@repo/tooling:static-check`                                                       |
| `REQ-SCAFFOLD-QUALITY-006`       | high     | tooling, operations             | `packages/tooling/src/commands/qa/**`; `test:world-class`                                                |
| `REQ-SCAFFOLD-AGENTS-007`        | high     | tooling, documentation          | `packages/tooling/scripts/validate-agent-skills.spec.mjs`; agent docs                                    |
| `REQ-SCAFFOLD-SAFETY-008`        | critical | tooling, persistence, security  | Git/DB tooling tests; `db:migrations:rollback-check`; security gates                                     |
| `REQ-AUTH-CREDENTIAL-003`        | critical | domain, security                | `@app/backend-feature-auth-main:test`; auth API tests                                                    |
| `REQ-AUTH-TENANT-004`            | critical | domain, persistence, security   | auth/admin tests; `@app/backend-feature-auth-test:component-test`                                        |
| `REQ-AUTH-IDENTITY-005`          | critical | domain, security, journey       | auth/social identity tests; `fullstack-e2e:e2e`                                                          |
| `REQ-AUTH-PROFILE-006`           | high     | domain, API                     | user-main and user API tests; consumer contracts                                                         |
| `REQ-AUTH-PERSISTENCE-007`       | critical | persistence, domain             | auth PostgreSQL suites; migration component tests                                                        |
| `REQ-AUTH-AUDIT-008`             | high     | domain, security, operations    | audit/admin analytics tests; observability lane                                                          |
| `REQ-AUTH-FRONTEND-009`          | high     | domain, journey                 | user auth/logout/profile/social/TMA tests; Playwright                                                    |
| `REQ-API-CONTEXT-003`            | high     | domain                          | request-context and bootstrap tests                                                                      |
| `REQ-API-VALIDATION-004`         | high     | domain, API                     | validation tests; API contract tests                                                                     |
| `REQ-API-CLIENT-005`             | high     | API, domain                     | generated-client checks; frontend API support/client tests                                               |
| `REQ-API-RESPONSE-006`           | high     | domain, API                     | exception/response/swagger/health tests; contract checks                                                 |
| `REQ-NOTIFY-TEMPLATE-003`        | high     | domain, persistence             | notification application and PostgreSQL component suites                                                 |
| `REQ-NOTIFY-AUDIENCE-004`        | critical | domain, persistence, security   | notification audience tests; component/security gates                                                    |
| `REQ-NOTIFY-PERSISTENCE-005`     | critical | persistence, security, async    | payload crypto/outbox tests; component and concurrency gates                                             |
| `REQ-NOTIFY-PREFERENCE-006`      | high     | domain, journey                 | frontend shared/user preference tests; browser journeys                                                  |
| `REQ-FRONTEND-ACCESSIBILITY-003` | high     | domain, journey                 | `@app/frontend-ui-web:test`; Storybook/browser matrix                                                    |
| `REQ-FRONTEND-SHELL-004`         | high     | domain, journey                 | app shell tests; `fullstack-e2e:e2e`                                                                     |
| `REQ-FRONTEND-ERROR-005`         | high     | domain, API, journey            | API-support/UI overlay tests; contract and browser gates                                                 |
| `REQ-FRONTEND-NATIVE-006`        | high     | domain, journey                 | `mobile-app:test`; native export/runtime checks                                                          |
| `REQ-FRONTEND-SSR-007`           | high     | domain, journey                 | landing/site tests; browser E2E coverage                                                                 |
| `REQ-FRONTEND-DESIGN-008`        | normal   | domain, documentation           | UI web/native tests; Storybook and visual evidence                                                       |
| `REQ-RUNTIME-CONFIG-003`         | critical | domain, security                | common config and app health-config tests; security gates                                                |
| `REQ-RUNTIME-LIFECYCLE-004`      | critical | domain, async                   | bootstrap, consumer, scheduler, and component lifecycle tests                                            |
| `REQ-RUNTIME-OBSERVABILITY-005`  | high     | domain, operations              | analytics/logger/OTel tests; observability lane                                                          |
| `REQ-RUNTIME-MESSAGING-006`      | critical | async, operations               | NATS/Redis/WebSocket and process tests; concurrency lane                                                 |
| `REQ-RUNTIME-STORAGE-007`        | high     | domain, security                | S3/Redis adapter tests; security gates                                                                   |
| `REQ-RUNTIME-DATABASE-008`       | critical | persistence, domain             | shared/auth/notification PostgreSQL suites; rollback check                                               |
| `REQ-RUNTIME-DELIVERY-009`       | critical | operations, security            | deployment tests; Docker, Compose, Helm, and workflow validation                                         |
| `REQ-RUNTIME-BOUNDARY-010`       | high     | domain, security                | static/network/health tests; security gates                                                              |
| `REQ-SOCIAL-COMMANDS-003`        | high     | domain, security                | Telegram/Discord command, menu, and controller tests                                                     |
| `REQ-SOCIAL-CONFIG-004`          | critical | domain, security, documentation | provider config/i18n tests; security and docs checks                                                     |
| `REQ-SOCIAL-LIFECYCLE-005`       | critical | async, operations               | Telegram polling, Discord registration, session, and runtime gates                                       |

Existing requirements retain their current high-signal evidence and receive
precise requirement-level project scopes during sidecar migration.

## Independence Review

The assurance implementation is challenged by fixture-based validator tests,
not by its production parser alone. Skill routing is challenged by the offline
skill validator. Product behavior keeps its owning unit matrices while
contracts, property/mutation tests, component infrastructure, Playwright,
security, deployment, and operations commands provide different failure
oracles. The full test inventory cannot independently prove itself and is never
counted as a replacement for these evidence arrays.

## PR, Main, Nightly, and Runtime Lanes

- **PR:** strict OpenSpec/inventory/skill validation, affected unit/static/
  security evidence, Cucumber, contract checks, and exact-SHA dossier.
- **Main:** broader component and contract evidence for changed requirements.
- **Nightly:** mutation, property, concurrency, resilience, rollback, recovery,
  observability, and world-class QA.
- **Runtime:** full-stack Playwright and environment-bound operational checks.

A required skip is not a pass. Local absence of a runtime dependency is
reported as a bounded unavailable lane; hosted CI remains authoritative only for
the exact successful revision.

## Residual Risk

- Traceability cannot prove that a human omitted no product requirement.
- A broad requirement can still hide an underspecified rule; independent review,
  mutation/property checks, incidents, and runtime evidence remain necessary.
- External provider and production canaries remain outside deterministic PR
  proof.

## Independent Verification Reviewer

- `quality-engineering`, with `security-maintainers` and
  `platform-operations` review for their selected profiles.
