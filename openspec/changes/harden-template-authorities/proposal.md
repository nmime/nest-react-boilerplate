# Harden authentication authority and session boundaries

## Why

The source audit at `f487d105959e5859d7ac1b7a5a82251e4528f16b` found that callback state, provider subjects, bootstrap roles, duplicate HTTP composition, and logout do not consistently retain their intended authority. Fix these boundaries before presenting the upgraded template as ready for review.

## What Changes

- Bind browser Discord OAuth to the initiating server session and immutable local account and tenant; signed bot interactions support subject-bound linking only.
- Require verified Telegram identity at the HTTP bot-link boundary, and enforce link-token provider, purpose, account, and tenant constraints.
- Restrict administrator bootstrap to verified provider email or trusted offline provisioning.
- Give bot hosts a service-only auth module without duplicate authentication routes.
- Revoke both local session credentials on logout and remove account-owned frontend cache data.
- Preserve PostgreSQL URI and environment TLS policy across ORM and both session credential stores.
- Bind privileged seeds to the operator-selected identity and canonical account, retaining demo users only in local development.
- Contain local notification fixture objects and metadata in a private owned root, reject symlinks and escaping keys, bound request bodies, and omit credential values from logs.
- **BREAKING**: unsigned bot-link HTTP requests, unbound OAuth service calls, and unverified bootstrap registration no longer obtain the previous authority.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `authentication-access`: requirements `REQ-AUTH-SESSION-002`, `REQ-AUTH-CREDENTIAL-003`, `REQ-AUTH-IDENTITY-005`, and `REQ-AUTH-FRONTEND-009` retain their stable identifiers.
- `runtime-operations`: `REQ-RUNTIME-DATABASE-008` specifies common PostgreSQL TLS policy and real trusted/untrusted/plaintext acceptance boundaries; `REQ-RUNTIME-DELIVERY-009` specifies verified TLS for fresh external database scaffolding; `REQ-RUNTIME-STORAGE-007` contains local fixture filesystem authority and payloads.
- `workspace-scaffolding`: `REQ-SCAFFOLD-SAFETY-008` prevents privileged seeds from promoting a pre-existing public account and excludes demo credentials outside local development.

## Impact

Auth main/shared, Discord host and adapter, frontend logout and provider identities, generated HTTP contracts, and session ownership documentation. PostgreSQL and MongoDB remain alternative persistence owners. Main and production remain read-only pending the maintainer's specific approval.
