# @app/backend-mongodb-main-auth Instructions

Follow the root `AGENTS.md`, `libs/backend/AGENTS.md`, and the Mongo shared
runtime rules in `libs/backend/mongodb/main/shared/lib/AGENTS.md`.

- Keep Mongo documents private to this adapter and expose neutral auth records.
- Every multi-document mutation must use `runInMongoTransaction`.
- Preserve tenant isolation in every filter and compound index.
