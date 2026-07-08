# CI triage skill

Use this skill when a workflow, check, or pipeline fails.

## Required context

1. Read `../../../AGENTS.md` and `../../../docs/ai/agent-policy.md`.
2. Identify the failing workflow, job, command, branch, commit SHA, and whether the failure is on the branch or target branch.
3. Read the workflow file and the repository command docs that define the failing command.
4. Inspect the smallest source/config area that can explain the failure.

## Triage method

- Start from the first real error, not the final cascade.
- Reproduce locally with the narrowest repository command when practical.
- Distinguish code failures from environment blockers such as Docker, network, credentials, missing secrets, or sandbox restrictions.
- Do not mark a failure flaky without evidence from repeated runs or known issue history.
- Keep fixes scoped to the failing surface. Avoid broad cleanup unless it is required to make the check meaningful.

## Validation

After a fix, rerun the failing command or the closest safe local equivalent. Also run `git diff --check` for any edited files and the relevant targeted checks from `../../../docs/command-matrix.md`.

## Output format

Report the failing command/job, root cause, changed files, validation run, and any remaining blocker. Include exact command output only when it is short and necessary.
