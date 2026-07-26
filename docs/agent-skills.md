# Agent skills

Canonical repo-wide AI agent rules live in [AGENTS.md](../AGENTS.md). Follow those first, then use the focused workflow docs and skills below when they match the task.

## Repo-local skills

Repo-local skills live under `.agents/skills/**`. Every skill is a discoverable
package with `SKILL.md` instructions and `agents/openai.yaml` interface
metadata. Run `pnpm run agent:skills:check` after changing any skill.

### Skill package standard

Every repository skill must:

- use a verb-led kebab-case name and a frontmatter description that states both
  the capability and concrete trigger conditions
- keep the body concise, imperative, repository-specific, and free of repeated
  trigger prose already carried by frontmatter
- include a `Read first` section with valid canonical paths and a bounded
  verification, handoff, report, or output contract
- avoid auxiliary README, changelog, installation, or quick-reference files;
  add scripts or references only when they remove repeated work or large context
- expose quoted `display_name`, `short_description`, and a one-sentence
  `$skill-name` default prompt through `agents/openai.yaml`
- appear in this catalog and the workflow selector so humans and agents can discover it

The offline validator enforces packaging, trigger quality, required sections,
local references, interface metadata, prompts, and discovery. Documentation
validation also checks every root command referenced by repo-local skills.

### Initialize and extend the workspace

- [Initialize product](../.agents/skills/initialize-product/SKILL.md) selects and
  verifies applications through the repository CLI.
- [Update boilerplate base](../.agents/skills/update-boilerplate-base/SKILL.md)
  reconciles a downstream product with a newer tagged boilerplate release while
  preserving product ownership, migrations, selections, and published history.
- [Scaffold feature](../.agents/skills/scaffold-feature/SKILL.md) creates genuinely
  new application, library, or vertical-feature ownership.
- [Maintain generators](../.agents/skills/maintain-generators/SKILL.md) changes
  generator schemas, templates, collision rules, and scaffold tests.
- [Activate capability](../.agents/skills/activate-capability/SKILL.md) wires an
  optional capability into explicitly selected applications.

### Develop product behavior

- [Specify behavior](../.agents/skills/specify-behavior/SKILL.md) converts product
  intent into stable OpenSpec requirements, precise project ownership, and
  risk-based evidence before implementation.
- [Implement specified change](../.agents/skills/implement-specified-change/SKILL.md)
  implements approved behavior while synchronizing code, executable test
  markers, Gherkin examples, evidence sidecars, and change tasks.
- [Plan frontend change](../.agents/skills/plan-frontend-change/SKILL.md) resolves
  renderer, ownership, user states, cross-boundary work, and proof before implementation.
- [Design frontend experience](../.agents/skills/design-frontend-experience/SKILL.md)
  defines intentional accessible web/native UX within shared token and component boundaries.
- [Design from reference](../.agents/skills/design-from-reference/SKILL.md) turns a
  real-world example (brand, live site, screenshot, or DESIGN.md file) into
  intentional, original UI expressed through `--xr-*` tokens and shared primitives
  without cloning third-party identity.
- [Plan backend change](../.agents/skills/plan-backend-change/SKILL.md) resolves
  runtime ownership, invariants, contracts, consistency, failure modes, rollout,
  and proof before backend implementation.
- [Develop backend API](../.agents/skills/develop-backend-api/SKILL.md) covers
  NestJS/Fastify controllers, DTOs, domain behavior, RFC 9457 errors, and API tests.
- [Develop background process](../.agents/skills/develop-background-process/SKILL.md)
  covers consumers, schedulers, retries, idempotency, and lifecycle behavior.
- [Develop web frontend](../.agents/skills/develop-web-frontend/SKILL.md) covers
  Vite, Astro, and Vike apps with Feature-Sliced and browser-test boundaries.
- [Develop mobile frontend](../.agents/skills/develop-mobile-frontend/SKILL.md)
  covers Expo, React Native, and native UI without DOM-only dependencies.
- [Source-owned web UI](../.agents/skills/shadcn-ui/SKILL.md) discovers and
  imports reviewed shadcn or free Magic UI source into `@app/frontend-ui-web`,
  keeps Aceternity preview non-persistent and undistributed by the template,
  assigns any later integration to the downstream product owner, and requires
  browser/visual quality proof.

### Change cross-project contracts

- [Change API contract](../.agents/skills/change-api-contract/SKILL.md) propagates
  controller/DTO changes through OpenAPI, generated clients, and consumers.
- [Migrate database](../.agents/skills/migrate-database/SKILL.md) covers safe
  MikroORM schema and data migrations with rollback and Testcontainers proof.
- [Change auth access](../.agents/skills/change-auth-access/SKILL.md) covers
  sessions, tenants, RBAC, guards, and fail-closed security tests.
- [Extend notifications](../.agents/skills/extend-notifications/SKILL.md) covers
  events, templates, providers, scheduler, consumer, and delivery semantics.
- [Change internationalization](../.agents/skills/change-i18n/SKILL.md) owns locale
  catalogs, localized problem details, templates, and parity checks.

### Operate and assure the repository

- [Review specification assurance](../.agents/skills/review-specification-assurance/SKILL.md)
  independently audits requirement completeness, ownership, evidence meaning,
  omissions, and exact-revision provenance.
- [Validate backend quality](../.agents/skills/validate-backend-quality/SKILL.md)
  applies backend-specific contract, infrastructure, migration, process lifecycle,
  security, observability, performance, and runtime gates.
- [Validate frontend quality](../.agents/skills/validate-frontend-quality/SKILL.md)
  applies frontend-specific component, Storybook, visual, browser, accessibility,
  responsive, SSR, and native gates.
- [Validate change](../.agents/skills/validate-change/SKILL.md) selects proportional
  static, unit, integration, browser, Docker, and generated-artifact checks.
- [Maintain documentation](../.agents/skills/maintain-documentation/SKILL.md) keeps
  canonical docs accurate, indexed, and reachable through agent retrieval routes.
- [Maintain repo tooling](../.agents/skills/maintain-repo-tooling/SKILL.md) changes
  the `nrb` CLI, repository scripts, command docs, and executable checks.
- [Prepare deployment](../.agents/skills/prepare-deployment/SKILL.md) validates
  Docker, Helm, GitOps, or single-server config without releasing it.
- [Upgrade dependencies](../.agents/skills/upgrade-dependencies/SKILL.md) preserves
  package scope, pnpm lockfile policy, and compatibility proof.
- [PR review](../.agents/skills/pr-review/SKILL.md), [CI triage](../.agents/skills/ci-triage/SKILL.md),
  and [service audit](../.agents/skills/service-audit/SKILL.md) provide evidence-led
  review, failure diagnosis, and project audit workflows.

See [AI agent workflows](ai/agent-workflows.md), [retrieval policy](ai/retrieval-policy.md), and [context packing](ai/context-packing.md) for when to use always-loaded instructions, docs, skills, or nested `AGENTS.md` files.

The web Storybook is configured at `libs/frontend/ui-web/lib/.storybook`,
runs with `pnpm storybook`, and builds to
`dist/storybook/frontend-ui-web`. Its primary surface remains reusable
`@app/frontend-ui-web` components. Explicit deterministic screen compositions
live in each web app's `storybook/` directory and appear under
`Applications/*`. These stories render app-owned views with controlled
providers and app CSS; they do not replace browser tests for routing,
production providers, authentication, API integration, or complete page flows.
Stories enter visual regression only through the explicit `visual` tag. The PR
lane checks the current platform's Chromium baselines, while the scheduled
quality preset runs the desktop/mobile browser matrix. Expo remains in the
native test lane.

## Frontend delivery workflow

Start observable behavior with `$specify-behavior`, implement the approved
artifacts with `$implement-specified-change`, then use `$plan-frontend-change`
for scope and ownership, `$design-frontend-experience`
when visual or UX direction changes, `$design-from-reference` when the direction
is anchored to a real-world example, the matching web/mobile development skill
for implementation, `$validate-frontend-quality` for risk-based proof, and
`$review-specification-assurance` for independent assurance.
LazyWeb is optional reference research, not a prerequisite or source of truth.

## Backend delivery workflow

Start observable behavior with `$specify-behavior`, then use
`$plan-backend-change` for runtime, ownership, invariants, failure modes, and
rollout. Implement the approved artifacts with `$implement-specified-change`
plus `$develop-backend-api` or `$develop-background-process`, chain
contract/auth/database/notification skills only for changed boundaries, and
finish with `$validate-backend-quality` and
`$review-specification-assurance`. Use `$validate-change` when the same diff
also crosses frontend, tooling, generator, deployment, or repository-wide
boundaries.

## UI/UX Pro Max priority hierarchy

1. User task and product intent: solve the requested flow before cosmetic cleanup.
2. Accessibility and semantics: keyboard paths, labels, landmarks, focus, contrast, reduced motion.
3. Design-system tokens: use shared `--xr-*` tokens, shadcn/ui-style primitives, Radix behavior, and Tailwind utilities.
4. Responsive proof: preserve the 320 px floor and explicitly test RU at 375 px with no horizontal overflow.
5. State and polish: loading, empty, error, current-route, light/dark, and high-contrast states.
6. Evidence: capture browser proof and update visual baselines only for intentional UI changes.

## LazyWeb instructions

LazyWeb is not vendored in this repository. When the skill is available in the agent environment, import or enable it from its published source before a redesign pass, then run its design-research workflow for the specific surface being changed.

Recommended workflow:

1. Import/enable LazyWeb in the agent runtime using the published LazyWeb skill link provided by your workspace or skill catalog.
2. Run LazyWeb research for the target, for example `admin product shell navigation`, `auth form controls`, or `landing app shadcn cards`.
3. Save generated reports under `.lazyweb/design-research/{topic}-{date}/report.html` and references under `.lazyweb/design-research/{topic}-{date}/references/`.
4. Summarize only the applicable patterns in the PR description; do not vendor LazyWeb repositories or large third-party assets.

See also `docs/frontend-uiux-pro-max-lazyweb.md` for the frontend checklist tied to this template.
