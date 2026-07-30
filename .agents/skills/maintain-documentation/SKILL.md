---
name: maintain-documentation
description: Create, update, reorganize, or review repository documentation while preserving canonical ownership and agent discoverability. Use for Markdown changes, command or architecture documentation, README and AGENTS routing, runbooks, ADRs, skill catalogs, retrieval maps, or documentation quality-gate failures.
---

# Maintain repository documentation

## Read first

- Read `../../../docs/README.md`, `../../../docs/ai/retrieval-policy.md`, `../../../docs/ai/repo-map.md`, the canonical source/config/tests for the claim, and the nearest README/AGENTS files.
- For agent workflow changes, also read `../../../docs/agent-skills.md`, `../../../docs/ai/agent-workflows.md`, and the affected `.agents/skills/**` packages.

## Choose the canonical owner

1. Put always-on safety and ownership policy in root or justified subtree `AGENTS.md`; keep these files short and link to detail.
2. Put repeatable multi-step agent procedures in `.agents/skills/**`, durable topic guidance in `docs/**`, and project-specific usage in the nearest README.
3. Keep generated facts in their source: project catalog from setup/Nx metadata, public aliases from `tsconfig.base.json`, ports from `docs/PORTS.md`, commands from `package.json` and the command matrix, and environment keys from `.env.example` plus the environment guide.
4. Update existing canonical documentation instead of creating overlapping guides. Add an ADR only for a durable architectural decision with alternatives and consequences.
5. Make every new or moved document reachable from `docs/README.md`, directly or through a linked nested index. Add task routing to `docs/ai/repo-map.md` or `docs/ai/retrieval-policy.md` when agents otherwise cannot find it.
6. When adding or renaming a skill, update `docs/agent-skills.md` and the workflow selector in `docs/ai/agent-workflows.md`; keep `agents/openai.yaml` aligned with `SKILL.md`.
7. Verify commands, paths, links, anchors, behavior, and examples against live source. Do not retain stale claims for compatibility.

## Specification lifecycle

When documentation or skill guidance changes observable product, tooling, or
agent workflow behavior, establish or update the governing requirement through
`$specify-behavior` and synchronize the approved implementation and evidence
through `$implement-specified-change`. Pure wording, indexing, and
source-preserving corrections may retain existing requirements.

## Verification

Run focused tests for changed documentation tooling, then:

```bash
pnpm run docs:check
pnpm exec prettier --check <changed-markdown-files>
git diff --check
```

Run `pnpm run agent:skills:check` when a skill changes. Run
`pnpm run agent:verify` when agent policy, skills, setup, generators, ownership,
or scaffolding guidance changes. Report generated docs separately and never hand-edit them.
