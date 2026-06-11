# Launching a new project from this boilerplate

## Fast path

```bash
git checkout -b chore/initialize-project
pnpm install --frozen-lockfile
pnpm init:project -- --name "Acme App" --domain acme.example --owner your-github-org --dry-run
pnpm init:project -- --name "Acme App" --domain acme.example --owner your-github-org
pnpm run check
```

The initializer replaces known boilerplate tokens (`nest-react-boilerplate`, `Nest React Boilerplate`, database name, example domains, JWT audience, and owner placeholders). It refuses a dirty worktree unless `--force` is provided and does not rewrite Git history.

## Manual checklist

1. Rename package, product title, database name, image repository, and public domains.
2. Copy `.env.local.example`, `.env.test.example`, or `.env.production.example` to the environment-specific secret source.
3. Replace placeholder secrets with values from a secret manager. Never commit real `.env` files.
4. Review `CODEOWNERS`, issue templates, Dependabot, CodeQL, and branch protection.
5. Configure production auth lifecycle decisions before launch: session storage, refresh tokens, password reset, email verification, rate limits, and audit events.
6. Export OpenAPI and generate typed client scaffolding if the frontend will consume generated API types.
7. Run migrations, seed only local/test environments, configure backups, then deploy through the Kubernetes/Ansible flow in `docs/production-deploy.md`.

## Placeholder audit expectations

Before production, search changed files for weak defaults such as `change-me`, `<set-from-secret-manager>`, `example.com`, local-only JWT secrets, default PostgreSQL passwords, and empty OAuth secrets. Keep placeholder values in example files only.
