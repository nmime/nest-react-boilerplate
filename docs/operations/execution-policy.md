# Execution Policy

This document defines execution and agent-handling conventions for this repository. It complements the root [AGENTS.md](../../AGENTS.md), which remains the canonical AI coding policy for repository changes.

## Agent Usage

- For delegated or remote sub-agent work, use **fresh, minimal agents** for each discrete task. Avoid long-lived context where possible.
- Delegated agents must follow [AGENTS.md](../../AGENTS.md), report what they changed, and include the verification they actually ran.

## Remote Execution

- **Do not use `hetzner_exec`** (legacy unstructured shell wrapper).
- Prefer **first-class `remote_server` tools** or **structured `omni_remote_exec` v6** for all remote operations.
- Use structured tool APIs (MCP/Tool Router) over raw shell wherever available.

## Security

- **Never print, log, or expose secrets, tokens, API keys, credentials, or hostnames** in output, logs, or commits.
- Inject credentials only into the target environment at execution time.

## Branch & Deployment Discipline

- Never push directly to `main`. All work must go through branches.
- Validate locally before committing.
