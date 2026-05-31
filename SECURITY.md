# Security Policy

## Supported versions

Security fixes target the current `main` branch. Projects launched from this boilerplate should define their own supported release windows after the first production release.

## Reporting a vulnerability

Please report suspected vulnerabilities privately to the repository owner or security contact configured for your launched project. Do not open public issues for exploitable findings.

Include:

- affected app/API and commit SHA;
- reproduction steps and expected impact;
- whether credentials, tokens, or private data may be exposed.

## Baseline expectations

- Store production secrets in a secret manager or Kubernetes Secret, never in Git.
- Rotate any value that was committed, logged, or pasted into a ticket.
- Keep `OPENAPI_ENABLED=false` on public production APIs unless protected upstream.
- Use explicit CORS origins, strong JWT/cookie secrets, TLS, migrations, backups, and `/ready` probes.
