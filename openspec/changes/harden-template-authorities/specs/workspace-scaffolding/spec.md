## MODIFIED Requirements

### Requirement: [REQ-SCAFFOLD-SAFETY-008] Git and database tooling fails safely

Git, migration, seed, restore, and environment tooling SHALL preserve repository
and data ownership through explicit ranges, validation, previews, and rollback
checks.

**Evidence profile:** tooling, persistence, security

**Invariants:**

- Destructive operations require explicit intent.
- Migration and restore checks never expose secrets in output.
- Seed commands SHALL honor the selected administrator email and display name.
  Non-local or production seeding SHALL require a non-default strong password
  independently of the chosen email, and SHALL create only the explicitly
  selected administrator rather than development demo users.
- Seed grants SHALL target only the canonical seed-owned account identifier
  and matching email. A pre-existing public account with the selected email or
  a canonical identifier bound to another email SHALL stop the transaction
  before granting administrator authority. Repeating a seed for the same
  canonical account SHALL preserve its existing credentials.
- Destructive persistence component fixtures SHALL use only containers created by the
  current fixture. Ambient database URLs and existing localhost servers SHALL
  never become fallback targets. A required component lane SHALL fail when its
  owned fixture cannot start, rather than reporting runtime proof from skipped
  or substituted persistence.
- Local runtime harnesses that grant fixture authority SHALL require an
  explicitly selected test database on loopback with a test/development
  namespace. Generic runtime URLs, another product's default database, and
  production mode SHALL never authorize fixture writes.

**Failure behavior:**

- Invalid history, migration, database, or environment state stops the command.

#### Scenario: PostgreSQL Docker archive outside the workspace

- **WHEN** an explicitly requested backup or restore uses an archive path outside the repository
- **THEN** the Docker fallback mounts the archive's parent directory at a known container path
- **AND** restore mounts the archive read-only and credentials remain outside process arguments

#### Scenario: Destructive intent missing

- **WHEN** a destructive-capable command lacks explicit apply intent
- **THEN** it performs only validation or preview

#### Scenario: Existing public account at the selected seed email

- **WHEN** an approved seed encounters a different existing account at its selected email
- **THEN** it refuses promotion and rolls back every seed write

#### Scenario: Explicit administrator on a non-local database

- **WHEN** the operator supplies the required non-local approvals and strong credential
- **THEN** seeding honors the selected identity, creates no known-password demo users, and can repeat for that same canonical account without replacing its password
