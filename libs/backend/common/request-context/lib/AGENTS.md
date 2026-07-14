# @app/backend-common-request-context Instructions

Follow the root [AGENTS.md](../../../../../AGENTS.md), [backend library rules](../../../AGENTS.md), and [AI agent policy](../../../../../docs/ai/agent-policy.md).

- Own only process-local request context propagation.
- Keep this library independent from HTTP transport, response mapping, logging, persistence, and product features.
- Preserve the public `requestContext` API unless migration work is explicitly requested.

See [README.md](./README.md) for verification commands.
