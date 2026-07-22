---
name: ci-triage
description: Diagnose repository workflow, check, and pipeline failures from the first real error. Use when CI is red, a local equivalent fails, or code failures must be separated from environment and infrastructure blockers.
---

# Triage CI failures

## Read first

1. Read `../../../AGENTS.md` and `../../../docs/ai/agent-policy.md`.
2. Identify the failing workflow, job, command, branch, commit SHA, and whether the failure is on the branch or target branch.
3. Read the workflow file and the repository command docs that define the failing command.
4. Inspect the smallest source/config area that can explain the failure.

## Workflow

1. Start from the first real error, not the final cascade.
2. Reproduce locally with the narrowest repository command when practical.
3. Distinguish code failures from environment blockers such as Docker, network,
   credentials, missing secrets, or sandbox restrictions.
4. Do not mark a failure flaky without evidence from repeated runs or known issue history.
5. Diagnose and report the cause first. Implement a fix only when the task also
   requests remediation; keep it scoped to the failing surface.

## Validation

After an authorized fix, rerun the failing command or the closest safe local
equivalent. Also run `git diff --check` for edited files and the relevant
targeted checks from `../../../docs/command-matrix.md`.

## Output format

Report the failing command/job, root cause, evidence, changed files if any,
validation run, and any remaining blocker. Include exact command output only
when it is short and necessary.
