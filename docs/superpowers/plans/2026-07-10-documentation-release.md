# Documentation and Release Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a navigable, tested guide for setup and extension, then verify and publish the complete campaign.

**Architecture:** One docs index links task-oriented guides and reference pages. Commands in docs are executable smoke fixtures where practical. Release verification uses the exact remote tree after push.

**Tech Stack:** Markdown, markdownlint, Nx/pnpm command examples, GitHub MCP.

**Ownership:** Worker K owns docs index/quick start; Worker L owns CLI/generator/config references; Worker M owns extension/migration/troubleshooting. Integration owner runs doc links/examples and release gates.

**Autonomous Execution:** Derive every command from actual CLI help/schema. Do not document unsupported technology combinations. Prefer runnable examples with noninteractive equivalents.

**Validation Evidence:** markdownlint, link check, command smoke tests, clean git status, remote SHA, remote/local tree equality, and post-push frozen install/audit/build/test smoke.

**True Blockers:** Missing GitHub access is a blocker only after local acceptance is complete; preserve the commit SHA and exact credential requirement.

---

### Task 1: Documentation navigation and quick start

**Files:**
- Create: `docs/README.md`
- Create: `docs/quick-start.md`
- Modify: `README.md`
- Modify: `docs/new-project.md`

- [ ] Add a role-based docs index for adopters, application developers, library authors, operators, and maintainers.
- [ ] Document clone, prerequisites, `nrb doctor`, interactive setup, noninteractive setup, install, dev, and verification.
- [ ] Replace obsolete init instructions with compatibility notes and links.
- [ ] Execute every quick-start command through dry-run/help smoke tests.
- [ ] Commit `docs: add setup-first documentation index`.

### Task 2: Configuration, CLI, and generator references

**Files:**
- Create: `docs/setup/configuration.md`
- Create: `docs/setup/presets-and-technologies.md`
- Create: `docs/setup/cli-reference.md`
- Create: `docs/setup/nx-generators.md`

- [ ] Document every config property, default, constraint, and schema version.
- [ ] Add a support matrix distinguishing selectable, fixed-compatible, and unsupported technologies.
- [ ] Capture real `nrb --help` and `nx g ... --help` command forms without copying unstable terminal formatting.
- [ ] Add interactive and CI/noninteractive examples for every operation.
- [ ] Commit `docs: document setup CLI and Nx generators`.

### Task 3: Extension, migration, and troubleshooting

**Files:**
- Create: `docs/setup/extending-generators.md`
- Create: `docs/setup/migration.md`
- Create: `docs/setup/troubleshooting.md`
- Create: `docs/usage/adding-a-new-service.md`
- Create: `docs/usage/adding-a-new-frontend-page.md`
- Create: `docs/usage/adding-an-auth-provider.md`
- Modify: `docs/first-feature-walkthrough.md`
- Modify: `CONTRIBUTING.md`

- [ ] Document catalog entries, schema changes, planner operations, adapters, templates, tests, and generator registration.
- [ ] Explain migration from `init:project` and `generate:feature`, including compatibility guarantees.
- [ ] Add exact recovery for dirty trees, conflicts, unsupported combinations, stale state, Docker absence, and failed rollback.
- [ ] Add day-to-day guides for creating and wiring a backend service, frontend route/page, and Better Auth provider, including boundaries, tests, build targets, and registration points.
- [ ] Update the feature walkthrough to show both `nrb add feature` and `nx g @repo/tooling:feature` paths.
- [ ] Commit `docs: explain generator extension and migration`.

### Task 4: Final acceptance and remote verification

**Files:**
- Modify only proven acceptance defects

- [ ] Run markdownlint and internal-link validation.
- [ ] Run complete readiness and generator acceptance plans without Nx cache.
- [ ] Ensure `git status --short` is empty and record the local commit/tree SHA.
- [ ] Push to GitHub main via MCP, fetch origin, and require `git diff --stat origin/main..HEAD` to be empty.
- [ ] Reset to the remote commit and rerun frozen install, prod/dev audits, CLI doctor, generator dry-run, representative builds, unit/component/e2e tests.
- [ ] Update the campaign ledger with exact totals, deferred incompatible majors, artifact locations, and remote commit URL.
