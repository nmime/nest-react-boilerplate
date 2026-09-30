# Design

## Decisions

The requested upstream and its protected merge check are GitHub-owned. Restore
the previously removed GitHub pipeline rendering alongside GitLab, with current
runtime/action pins, explicit read permissions, complete aggregate result
enforcement, provider-owned component prerequisites, and exact-source evidence.
The earlier removal's missing workflow token scope is resolved in the current
credential. Keep releases and promotion source-verified and preserve explicit
operator ownership; do not weaken protection, synthesize statuses, merge main,
or run publication/deployment during development.

Workers retain their existing private operational HTTP host. They explicitly
disable browser cookie sessions, CORS, and Swagger and use catalog-authored
host-specific service-only payment and fiat module expressions. This preserves
provider-neutral services while preventing accidental browser/product routes on
consumer and scheduler processes. Deployment health exposure remains an explicit
separate topology concern; no public worker hostname is introduced.

Notification admin mutations explicitly pass the audit repository's opaque
transaction token through controller, application service, and neutral persistence
ports. PostgreSQL validates and uses the supplied active manager rather than
starting an independent transaction. MongoDB validates and joins the supplied
active ClientSession, including result projection reads; operations in that
session are sequential. Standalone calls retain provider-owned transactions.
Actual-provider rollback fixtures inject audit and outbox failures after mutation
writes. Object storage is a separate side effect and is not described as database
transactional.

1. Selection updates spread the existing validated configuration but replace
   only the explicit app/capability/preset and operational inputs. Exact preset
   selection clears old selection lists while retaining product namespaces.
2. Interactive setup supplies existing identity, runtime, session, tenant, and
   app renames as defaults to its existing builder. Prompted product/deployment
   fields stay authoritative; unprompted deployment fields are preserved.
3. PostgreSQL migration probing first checks relation existence, then queries
   ledger contents only when the relation exists. Both commands are bounded;
   failed and ambiguous results retain the existing refusal behavior. An
   injectable SQL transport permits actual owned-container evidence without
   using ambient database URLs or requiring a host PostgreSQL client.
4. Validate library scope using the existing canonical kebab name boundary and
   validate layer against the existing FSD enum before calculating paths. Port
   allocation advances through the full valid range and rejects exhaustion.
5. Payment component fixtures always start their own Testcontainer. Remove both
   generic environment URL and pre-existing localhost fallbacks; Docker/startup
   failures remain failing evidence. Cleanup targets only the owned container
   and its ephemeral namespace.
6. Runtime startup requires parsed Compose configuration with at least one
   selected service. Inspect Docker state through one bounded successful JSON
   query per container, and compare observed service labels with all expected
   long-running services. Completed one-shot run commands already supply their
   exit status; their auto-removed containers are not required in `compose ps`.
   Fail closed on command, JSON, state, or label errors. Missing services stay
   pending within the existing bounded deadline and can never produce success.
7. CI parity can omit one alternative forge only while another configured
   pipeline supplies the declared evidence. When every pipeline is absent, add
   an explicit failing parity problem. GitLab `ops-gates` is schedule-only;
   mark its merge aggregate dependency optional so merge pipelines can be
   created, while its failures still block any lane where it is present. Keep
   mandatory merge jobs required. Official GitLab needs semantics support this
   distinction: https://docs.gitlab.com/ci/yaml/#needsoptional.
8. Update the managed-host pnpm boundary to the supported pnpm 12 major, with
   exact release syntax and a regression reading the canonical package-manager
   declaration. Use the declared upstream Git repository as the unattended
   bootstrap fallback; product forks can still explicitly provide their URL.
9. Telegram linking reuses `bot.menu.link` from the existing bot catalog. Do not
   import a frontend translation namespace into a bot. Exercise actual menus
   and callback updates in every supported locale.
10. The notification runtime harness requires `NRB_NOTIFY_TEST_DATABASE_URL`
    with a loopback test/development namespace, refuses production mode, and
    never falls back to generic `DATABASE_URL` or another product database.
    Validate before starting mocks or making authority-granting HTTP/SQL calls.

Runtime QA separates optional skips, explicit plans, and required targets. Its
validated bounds prevent empty sample passes, Lighthouse parses its actual JSON
score, and native fuzzing sends the generated probes and bodies. Every fuzz
engine uses a safe method selection by default. DAST classifies sensitive-file
content so SPA fallbacks do not create false exposure reports. Static fixture
serving checks decoded real paths and handles read errors. Secret fixtures are
registered by exact reviewed path/value, and property tests call exported helpers.
Default recovery commands use the existing owned-container drill rather than
restoring into an ambient source database.

## Risks and validation

Custom namespaces may expose latent schema conflicts when selecting a different
app; schema validation must reject conflicts instead of silently resetting them.
An absent ledger is fresh, not proof that arbitrary existing product data is
safe to rewrite; seed markers and the existing tenant guards remain in force.
Final full quality gates run once development is complete.

Native delivery initializes public configuration before a secret-free build,
then supplies private runtime credentials through the shared environment wrapper.
Managed hosts configure datastore credentials before migrations. Deployment owns
PM2 topology reconciliation; doctor reports obsolete processes without deleting
or saving them. Both native notification worker ports are included in collision,
loopback, and readiness checks. Manual rollback explicitly skips migrations and
that option is rejected for Compose before configuration mutation.

Frontend cache/header policy is exercised through real Nginx responses for the
Compose, standalone, Helm, and native static variants. The additional frontend
API hop preserves exact forwarded HTTP/HTTPS only from configured immediate
proxy CIDRs. An owned TLS terminator and private Fastify session fixture prove
secure-cookie transport and rejection of untrusted and malformed claims. This
fixture does not claim Better Auth revocation or native host certificate setup.

The opt-in developer observability profile pins current Grafana, Loki, and Tempo
images, migrates Tempo's native configuration, and uses aggregate HTTP readiness
because the Loki/Tempo images are distroless. Anonymous Grafana has Viewer
permission and creates no initial administrator. Its isolated component fixture
proves actual log/trace ingestion, datasource querying, and denied dashboard writes.
