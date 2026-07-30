# @app/backend-mongodb-main-notification Instructions

Follow the root `AGENTS.md`, `libs/backend/AGENTS.md`, and the Mongo shared
runtime rules in `libs/backend/mongodb/main/shared/lib/AGENTS.md`.

- Keep Mongo documents private and expose neutral notification records.
- Use `runInMongoTransaction` for every related multi-document mutation.
- Preserve deterministic atomic claims and require claim-token fencing on completion.
- Keep strict validators and idempotent indexes aligned with repository queries.
