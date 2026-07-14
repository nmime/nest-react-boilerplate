# Security Policy

## Supported versions

Security fixes target the current `main` branch. Projects launched from this boilerplate should define their own supported release windows after the first production release.

## Reporting a vulnerability

Please report suspected vulnerabilities privately. Do not open public issues for exploitable findings.

### GitHub

Report via [GitHub Security Advisories](https://github.com/nmime/nest-react-boilerplate/security/advisories/new) or contact security@example.com.

### GitLab

Report via the **Vulnerability Report** option in the repository's **Issues** page, or contact security@example.com.

### Bitbucket

Report via private message to the repository owner, or contact security@example.com.

### Response targets

- We acknowledge a private vulnerability report within 3 business days.
- We complete initial severity and ownership triage within 5 business days.
- We keep the reporter informed when remediation timing or disclosure plans change.

## Automated security scans

This repository includes automated security scanning for all supported platforms:

| Platform  | Secret detection | Dependency audit      | SAST   | Container scanning      |
| --------- | ---------------- | --------------------- | ------ | ----------------------- |
| GitHub    | Gitleaks         | Dependabot + audit:ci | CodeQL | Docker build validation |
| GitLab    | Secret Detection | Dependency Scanning   | SAST   | Container Scanning      |
| Bitbucket | Gitleaks         | audit:ci              | —      | Docker build validation |

## Secured components

- JWT sessions: min 32-char secret, token cleanup, timing-safe comparisons
- OAuth2: state hash verification, session cookies with HttpOnly
- RBAC: seeded role/permission catalog
- Network policies, PDB, HPA, rate limiting in production Helm values
