## MODIFIED Requirements

### Requirement: [REQ-ASSURANCE-RELEASE-003] Releases consume verified source only

Every configured forge SHALL cut a release only after the merge-blocking gates
of that exact source revision succeed, SHALL build from that revision rather
than from a branch tip re-resolved later, and SHALL refuse a revision the
default branch has already moved past.

**Evidence profile:** acceptance, security, operations

**Invariants:**

- CI parity SHALL require at least one configured pipeline; absence of every
  declared forge is a failure. Merge aggregates SHALL depend only on jobs that
  exist in their merge lane, or explicitly mark a schedule-only dependency
  optional without weakening mandatory merge gates.
- The upstream GitHub repository SHALL ship its configured GitHub CI alongside
  GitLab CI. Its protected `CI status summary` check SHALL always evaluate every
  merge-required job result and fail on failure, cancellation, or unexpected
  skipping. Restoring a workflow never permits a fabricated status or protection
  bypass. Release and promotion retain exact-revision checks and explicit
  operator-owned execution boundaries.

- Release automation never creates an untested source-code commit.
- A stale gate result cannot release a newer or replaced default-branch
  revision.
- What "release provenance" means is stated once, forge-neutrally, in the CI
  gate descriptor: each control names the release pipeline evidence it demands,
  and a forge that cannot carry a control — because its release runs inside the
  very pipeline that ran the gates, say — records the exclusion and its reason
  there instead of leaving the control unchecked.
- Every merge-blocking gate — commit conventions, specification validation,
  typecheck, and the repository-wide test sweep among them — is inventoried in
  one forge-neutral descriptor, and every configured forge renders that
  inventory. A forge that deliberately cannot run a gate records the exclusion
  and its reason in the descriptor rather than dropping the gate silently.

**Failure behavior:**

- Any provenance mismatch stops the release before publication.

#### Scenario: Verified-revision provenance

- **WHEN** a configured forge's release pipeline runs
- **THEN** it releases only the exact revision whose gates it verified

#### Scenario: Upstream required GitHub status

- **WHEN** a pull request runs GitHub CI
- **THEN** the protected aggregate check runs even after a dependency fails
- **AND** it succeeds only when every merge-required job succeeds

#### Scenario: Default branch moved after validation

- **WHEN** the verified revision is no longer the default-branch head
- **THEN** release automation refuses to continue
