# Discovery

## Actors and rules

The browser owns a first-party server session; Better Auth separately owns its provider credential. A provider callback proves the remote identity, but cannot choose a different local owner. A signed bot interaction proves the provider sender and must resolve that sender to a canonical local account before account operations.

Public password registration does not prove mailbox ownership. An email allowlist alone cannot grant administrator authority. Provider-email bootstrap requires verified email; privileged offline seeding remains a distinct workflow.

## Examples and counterexamples

- A callback succeeds in its initiating browser and fails when transferred to another session, even when state and PKCE remain valid.
- A signed Discord interaction can link only its verified Discord subject to its resolved local account; it never establishes a browser login.
- A Telegram bot-link HTTP request requires a verified Better Auth Telegram profile; caller-selected subject data cannot impersonate another Telegram user.
- A token for another provider, purpose, account, or tenant fails rather than being ignored when a principal is present.
- Logout succeeds only after both local credential owners revoke their session and all clearing cookies reach the response. An expired first-party principal does not prevent provider-session logout.
- A guest view never displays the preceding account's cached identities, including after late query completion.
- A TLS-required PostgreSQL URI reaches all three database consumers with its CA and mode intact; a wrong CA or plaintext-only server fails.
- A selected seed email already owned by another account aborts the transaction rather than promoting that account. Non-local seeds create no known-password demo users.
- A loopback object-store fixture cannot read, write, head, or delete an external sentinel via absolute, encoded traversal, or symlink paths; oversized bodies fail without stopping valid requests.

## Boundaries and failure modes

Existing provider disablement, hashed expiring state, atomic consumption, PKCE, and active-user checks remain effective controls. Browser nonce mismatch, account mismatch, unavailable revocation, and inactive target accounts fail closed. Link operations do not implicitly provision users. Legacy unbound callback states become invalid.

## Review and unresolved evidence

The completed Standard security scan supplied independent baseline, architecture, and identity-flow reviewers. Implementation and final assurance review remain pending. Real hosted provider, physical device, and production acceptance were not performed and cannot be inferred from local fixtures. No unresolved product decision blocks these authority fixes.
