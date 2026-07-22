# Launching a new project from this boilerplate

## One canonical initialization flow

Product initialization has two deliberate phases:

1. `pnpm nrb init` owns product identity and all example domains.
2. `pnpm nrb setup` owns application/capability selection.

Run both from a clean branch. Preview identity replacement, then make the app
selection interactively:

```bash
pnpm nrb init \
  --name "Acme App" \
  --domain acme.example \
  --owner your-github-org \
  --dry-run
pnpm nrb init \
  --name "Acme App" \
  --domain acme.example \
  --owner your-github-org

pnpm nrb setup
```

The compatibility alias `pnpm init:project -- ...` invokes the same product
initializer. New instructions and automation should use `pnpm nrb init`.

## Setup engine

The `pnpm nrb setup` engine is the primary way to configure which applications and capabilities your project uses. It is schema-validated, idempotent, and safe to re-run.

There is no default frontend or API application. Interactive setup starts from
an empty custom selection and asks which frontend, backend, E2E, and capability
entries the product needs. Profiles remain optional exact shortcuts.

```bash
# Interactive wizard:
pnpm nrb setup

# Non-interactive exact profile shortcut:
pnpm nrb setup --preset fullstack --non-interactive

# Add another application later, preserving the current selection:
pnpm nrb setup --app mobile-app --non-interactive

# Review current and available choices:
pnpm nrb setup --list

# Config file:
cp nrb.config.example.json nrb.config.json
# Edit nrb.config.json, then:
pnpm nrb setup --config nrb.config.json

# Dry run first:
pnpm nrb setup --preset fullstack --dry-run
```

See [Setup and Configuration](setup/configuration.md) for details.

`pnpm nrb init` refuses a dirty worktree unless `--force` is provided and does
not rewrite Git history. Its required `--domain` replaces `example.com` across
the root site, site/mobile/admin/user surfaces, auth/user/admin APIs, bot APIs,
staging hosts, TLS/CSP/deployment values, and example emails. It does not create
DNS records, certificates, environment secrets, or infrastructure accounts.
The selected landing/site owner receives `acme.example`; every other deployable
keeps its exact app ID as the hostname prefix. The generated
[Project Catalog](project-catalog.md) owns the complete template mapping and
marks the E2E project as non-deployable.

## Manual checklist

1. Review the `pnpm nrb init` diff for package, product, database, repository owner, image repository, and every public domain.
2. Copy `.env.local.example`, `.env.test.example`, or `.env.production.example` to the environment-specific secret source.
3. Replace placeholder secrets with values from a secret manager. Never commit real `.env` files.
4. Review `CODEOWNERS`, issue templates, Dependabot, CodeQL, and branch protection.
5. Configure production auth lifecycle decisions before launch: session lifetime/renewal/revocation, password reset, email verification, rate limits, and audit events.
6. Export OpenAPI and generate typed client scaffolding if the frontend will consume generated API types.
7. Run migrations, seed only local/test environments, configure backups, then deploy through the Kubernetes/Ansible flow in `docs/production-deploy.md`.

## Placeholder audit expectations

Before production, search changed files for weak defaults such as `change-me`, `<set-from-secret-manager>`, `example.com`, local-only session secrets, default PostgreSQL passwords, and empty OAuth secrets. Keep placeholder values in example files only.

## Next steps

- [Migration Guide](setup/migration.md) — migrate from legacy `init:project` / `generate:feature` to the setup engine.
- [Quick Start](quick-start.md) — get the stack running locally.
- [CLI Reference](setup/cli-reference.md) — every command with flags and examples.
- [Scaffolding and Extension Contract](scaffolding-and-extension.md) — required/optional apps and deployable completion criteria.
