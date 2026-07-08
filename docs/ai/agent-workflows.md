# AI agent workflows

These workflows keep repeatable agent procedures out of the always-loaded [AGENTS.md](../../AGENTS.md) and detailed [AI agent policy](agent-policy.md). Use the matching repo skill under `.agents/skills/**` when the agent runtime supports skills.

## Workflow selection

| Task                          | Use                                     | Read first                                                                     |
| ----------------------------- | --------------------------------------- | ------------------------------------------------------------------------------ |
| PR or branch review           | `.agents/skills/pr-review/SKILL.md`     | `AGENTS.md`, `docs/ai/agent-policy.md`, changed files, project configs, tests  |
| CI failure triage             | `.agents/skills/ci-triage/SKILL.md`     | failing job logs, workflow file, command matrix, local reproduction target     |
| Service or module audit       | `.agents/skills/service-audit/SKILL.md` | owning app/library config, source, tests, API contracts, operations docs       |
| Frontend UX or shared UI work | `docs/agent-skills.md`                  | frontend app shell, shared UI libraries, Storybook/tests, design workflow docs |
| API contract change           | no separate skill yet                   | controller/DTO source, OpenAPI output, generated clients, API lifecycle docs   |
| Database migration change     | no separate skill yet                   | migration source, entity/repository source, migration docs, rollback checks    |

## Common workflow rules

- Begin from the current branch, `origin/main`, and the exact files changed by the task.
- Read the closest source, tests, project config, and existing docs before editing.
- Prefer repository commands from [Command matrix](../command-matrix.md) and [Local verification](../local-verification.md).
- Keep findings tied to file paths, commands, and observed behavior.
- Do not invent compatibility shims or new docs sections when existing repo policy already covers the case.
- Do not use external AI coding assistants. Tool-specific instruction files must redirect to [AGENTS.md](../../AGENTS.md) instead of copying rules.

## Output expectations

For implementation work, report:

- files changed
- behavior changed
- validation actually run
- blockers or skipped checks with concrete reasons

For review work, report:

- findings first, ordered by severity
- exact file/line references where practical
- missing tests or residual risk
- a short summary only after findings

Never require magic completion markers. A normal final status with changed files and verification evidence is enough.
