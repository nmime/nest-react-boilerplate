# Native Nx Generators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose setup, application, library, and feature generation through discoverable native Nx generators backed by the shared setup engine.

**Architecture:** `packages/tooling/generators.json` declares public generators and JSON schemas. Thin generator implementations translate Nx options to shared configs and apply plans through an Nx Tree adapter.

**Tech Stack:** Nx 23 DevKit Tree/generator APIs, TypeScript, JSON Schema, Vitest.

**Ownership:** Worker H owns generator metadata/schemas; Worker I owns Nx Tree adapter and setup generator; Worker J owns app/lib/feature generators. Integration owner validates generated projects.

**Autonomous Execution:** Reuse the setup engine; do not duplicate templates or validation. Run Nx generator unit tests after each generator. Continue with documented default tags and paths when optional values are absent.

**Validation Evidence:** `nx g @repo/tooling:<name> --help`, dry-run output, in-memory Tree tests, disposable-worktree generation, `nx show projects`, and generated target build/test evidence.

**True Blockers:** Stop only if Nx cannot load the local plugin through supported Nx 23 APIs. Record plugin load stack and validate the shared engine independently first.

---

### Task 1: Generator collection and schemas

**Files:**
- Create: `packages/tooling/generators.json`
- Create: `packages/tooling/src/generators/setup/schema.json`
- Create: `packages/tooling/src/generators/application/schema.json`
- Create: `packages/tooling/src/generators/library/schema.json`
- Create: `packages/tooling/src/generators/feature/schema.json`
- Modify: `packages/tooling/package.json`

- [ ] Add schema validation tests for required names, enum values, defaults, and unknown options.
- [ ] Declare the four generators with descriptions, implementations, and schemas.
- [ ] Add `@nx/devkit` as a direct tooling dependency aligned to Nx 23.0.1.
- [ ] Run `nx g @repo/tooling:setup --help`; commit `feat(nx): declare boilerplate generators`.

### Task 2: Nx Tree adapter and setup generator

**Files:**
- Create: `packages/tooling/src/setup/adapters/nx-tree.ts`
- Create: `packages/tooling/src/generators/setup/generator.ts`
- Create: `packages/tooling/src/generators/setup/generator.test.ts`

- [ ] Write failing tests using `createTreeWithEmptyWorkspace` for dry-run-equivalent planning, file changes, conflicts, and idempotency.
- [ ] Implement the Tree adapter and setup option-to-config translation.
- [ ] Apply the shared plan and format only touched files.
- [ ] Verify the generated `nrb.config.json` parses with the shared schema; commit `feat(nx): add setup generator`.

### Task 3: Application and library generators

**Files:**
- Create: `packages/tooling/src/generators/application/generator.ts`
- Create: `packages/tooling/src/generators/application/generator.test.ts`
- Create: `packages/tooling/src/generators/library/generator.ts`
- Create: `packages/tooling/src/generators/library/generator.test.ts`

- [ ] Define supported application kinds from the catalog and library kinds from existing repository boundaries.
- [ ] Write failing tests for names, paths, tags, package manifests, project configuration, tsconfig aliases, and duplicate names.
- [ ] Implement generators through planner operations and official Nx helpers where they preserve repository conventions.
- [ ] Generate one backend app, frontend app, backend lib, and frontend lib in a temporary tree; require `nx show projects` to list each.
- [ ] Commit `feat(nx): generate repository applications and libraries`.

### Task 4: Feature generator migration and composition E2E

**Files:**
- Create: `packages/tooling/src/generators/feature/generator.ts`
- Modify: `packages/tooling/src/commands/project/generate-vertical-slice.ts`
- Test: generator and composition E2E tests

- [ ] Port existing vertical-slice expectations to shared feature-plan tests.
- [ ] Implement the Nx feature front end and keep the CLI wrapper behavior identical.
- [ ] Compose setup, application, library, and feature generators in a disposable worktree.
- [ ] Run format, lint, typecheck, test, and build targets for generated projects.
- [ ] Commit `feat(nx): add composable feature generator`.
