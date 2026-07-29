# @app/backend-mongodb-main-auth

Native MongoDB v7 persistence for auth, RBAC, audit, login analytics, problem
presentations, and the transactional outbox. Collection schemas and indexes are
migration-owned and verified by the transaction-capable shared Mongo runtime.

Multi-document mutations atomically persist domain state, audit, and outbox
records. Tenant-wide access-policy invariants use a serialization document;
revisioned problem presentations use expected-revision compare-and-set. External
outbox publication remains at least once rather than a distributed transaction.

```bash
pnpm exec nx run @app/backend-mongodb-main-auth:build
pnpm exec nx run @app/backend-mongodb-main-auth:test
pnpm exec nx run @app/backend-mongodb-main-auth:component-test
```
