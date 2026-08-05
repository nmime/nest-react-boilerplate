# Security Policy

## Supported versions

Security fixes target the current `main` branch. Projects launched from this boilerplate should define their own supported release windows after the first production release.

## Reporting a vulnerability

Please report suspected vulnerabilities privately. Do not open public issues for exploitable findings.

### GitHub

Report through [GitHub Security Advisories](https://github.com/nmime/nest-react-boilerplate/security/advisories/new). This is the canonical private intake channel for this repository.

### GitLab

If you are using a GitLab mirror, contact that mirror's owner privately or use a
private vulnerability-report feature that its maintainers have explicitly
enabled. Do not post an exploitable finding in a public issue.

Projects created from this boilerplate must configure and document their own
monitored security contact before launch; the template does not invent a mailbox.

### Response targets

- We acknowledge a private vulnerability report within 3 business days.
- We complete initial severity and ownership triage within 5 business days.
- We keep the reporter informed when remediation timing or disclosure plans change.

## Automated security scans

This repository includes the following checked-in security jobs. A job being
present does not prove that a hosting project has enabled required pipelines,
protected branches, or merge blocking.

| Platform | Checked-in coverage                                                                                                         | Enforcement notes                                                                                                                           |
| -------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub   | Gitleaks, native secret/SAST tests, CodeQL, `audit:ci`, Dependabot, and release-image Trivy scanning                        | CI, CodeQL, dependency audit, and Trivy commands are blocking; repository rules still determine whether merges require them.                |
| GitHub   | Weekly OpenSSF Scorecard (`.github/workflows/scorecard.yml`) with results published to the Security tab                     | Advisory signal; not a merge gate by itself.                                                                                                |
| GitLab   | Blocking Gitleaks and `audit:ci`, plus GitLab Secret Detection, Dependency Scanning, SAST, and Container Scanning templates | The checked-in jobs do not use `allow_failure`; availability of GitLab-managed scanner templates depends on the hosting tier/configuration. |

## Secured components

- First-party sessions: opaque IDs persisted by the selected PostgreSQL or replica-set MongoDB provider, HttpOnly cookies, rotation on authentication, and fail-closed account/RBAC reloads
- OAuth2/OIDC providers: state hash verification, PKCE where supported, signed-token validation, and isolated provider cookies/credentials
- RBAC: seeded role/permission catalog
- Network policies, PDB, HPA, rate limiting in production Helm values
