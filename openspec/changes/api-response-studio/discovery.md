## Actors

- Tenant administrator with `admin:settings:read` or `admin:settings:update`.
- Authenticated frontend consumer that can display toast, modal, custom, or silent presentations.
- Operator configuring the explicit OpenAPI hostname allowlist.

## Rules

- Every source, response, override, history read, and mutation is tenant-scoped.
- Sync is manual-only unless a downstream product adds scheduling explicitly.
- Remote JSON is accepted only through an injectable boundary after URL, DNS/IP, redirect, timeout, content-type, byte, object-JSON, and OpenAPI 3 checks.
- Sync preserves user configuration, marks missing responses deleted, is idempotent, and uses revisions plus transactional writes.
- Health and infrastructure endpoints do not enter the inventory.
- Existing toast/silent EN/RU overrides stay readable and writable after additive migration.
- Rich text permits only balanced safe tags and balanced `{variable}` placeholders consistently across populated languages; Cyrillic is valid.
- Bulk mutations are bounded and atomic. All mutations emit bounded/redacted audit and outbox records in the same transaction.
- Export is deterministic data, never executable imports copied from the attachment.

## Examples

- A circular local `$ref` produces a bounded `$circular` snapshot instead of recursion failure.
- Re-syncing an unchanged document produces only unchanged rows and no new source revision.
- Removing an OpenAPI response sets its change marker to `deleted` but preserves its administrator presentation.
- A `modal` override is returned as typed modal presentation and creates no toast in the toast-only runtime.
- A redirect from an allowlisted public hostname to `127.0.0.1` is rejected before the second request.

## Counterexamples

- A hostname absent from the configured allowlist is not fetched.
- Credentials, URL fragments, private DNS answers, non-JSON content, compressed/decompressed oversize bodies, arrays, and Swagger/OpenAPI 2 documents are rejected.
- A stale expected revision cannot partially update a bulk selection.
- Missing Chinese text is a coverage filter result, not blanket rejection of the row.
- Custom presentation data does not authorize rendering arbitrary executable HTML or JavaScript.

## Unresolved

None. The attached source is semantic input only; existing repository architecture and contracts remain authoritative.
