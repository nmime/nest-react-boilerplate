# Verification plan

The version 3 durable sidecar in `openspec/specs/authentication-access/verification.yaml` owns the exact Nx project and evidence mapping. Its existing per-requirement Cucumber dispositions remain authoritative; new unit/component evidence challenges the failure boundaries without duplicating stakeholder journeys.

| Requirement              | Risk and evidence owners                                                                                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-AUTH-SESSION-002     | Security: real Discord Nest composition, auth controller lifecycle, Better Auth revocation/cookie forwarding; existing persistent-session evidence for PostgreSQL and MongoDB.               |
| REQ-AUTH-CREDENTIAL-003  | Security: shared access-policy tests and auth registration/provisioning tests proving unverified allowlist rejection and verified-provider eligibility.                                      |
| REQ-AUTH-IDENTITY-005    | Security: external-auth state/token/profile tests, auth HTTP verified-context tests, Discord canonical-principal adapter tests.                                                              |
| REQ-AUTH-FRONTEND-009    | UI: real warm QueryClient logout tests, provider-panel guest rendering and late-query resolution tests, existing browser session journeys.                                                   |
| REQ-RUNTIME-DATABASE-008 | Security and persistence: effective MikroORM options and both pool constructors; real isolated PostgreSQL TLS connections for trusted CA, wrong CA, and plaintext refusal at the final gate. |
| REQ-SCAFFOLD-SAFETY-008  | Canonical identity and selected email/display tests, public-account collision rejection, local versus non-local credential guards, and final isolated transaction/idempotence evidence.      |
| REQ-RUNTIME-STORAGE-007  | Real loopback HTTP get/head/put/delete with external sentinels, encoded traversal and symlink rejection, private roots, oversized bodies, and safe logs.                                     |

Every changed executable test file retains exactly one requirement inventory marker and only requirement-owned projects. Assertions must cover rejected authority and unchanged storage, not merely mock invocation. Current scan reviewers provide independent source evidence; final assurance reviewer and exact source/evidence revision are still pending. Full quality gates run after development completes. Local fixtures do not prove hosted Discord/Telegram, real device, or production acceptance.
