# @app/backend-mongodb-main-feature-flags Instructions

Follow the root `AGENTS.md`, `libs/backend/AGENTS.md`, and the Mongo shared
runtime rules in `libs/backend/mongodb/main/shared/lib/AGENTS.md`.

- Keep MongoDB documents private and expose the common feature-flag contract.
- Preserve tenant scope in every filter and compound index.
- Keep the strict validator and deterministic indexes aligned with repository
  queries and the MongoDB migration ledger.
