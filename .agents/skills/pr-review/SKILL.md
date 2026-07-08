# PR review skill

Use this skill for branch, PR, or merge-request review in this repository.

## Required context

1. Read `../../../AGENTS.md` and `../../../docs/ai/agent-policy.md`.
2. Identify the current branch, merge base, and target branch.
3. Inspect changed files, including uncommitted changes when reviewing a local worktree.
4. Read the nearest project config, source, tests, generated artifact policy, and relevant docs for the changed surface.

## Review method

- Prioritize correctness, security, data-loss risk, behavioral regressions, generated artifact drift, and missing tests.
- Verify whether generated OpenAPI/client files were changed only when source changes justify regeneration.
- Check that public path aliases, project names, and runtime boundaries match repository docs.
- For docs changes, verify links, commands, package manager/runtime versions, and source-backed claims.
- For frontend changes, check Feature-Sliced Design boundaries, app ownership, responsive behavior, and expected smoke/Storybook coverage.
- For backend changes, check controller/DTO contracts, validation, health/readiness behavior, logging/secrets, migrations, and test coverage.

## Output format

Report findings first, ordered by severity. Each finding should include a file path and line reference when possible, explain the real impact, and name the expected fix or missing proof.

After findings, include open questions, residual risk, and a brief validation summary. If no issues are found, say that directly and state what was checked.
