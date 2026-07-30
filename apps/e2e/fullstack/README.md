# fullstack-e2e

## Ownership

This project owns cross-app smoke and full-stack verification. Keep reusable
fixtures and product behavior in their owning libraries rather than sharing
them through this test application.

## Commands

```bash
pnpm exec nx run fullstack-e2e:e2e
```

The extended Playwright matrix can target an existing stack by setting all of
`FULLSTACK_ADMIN_API_URL`, `FULLSTACK_USER_API_URL`,
`FULLSTACK_AUTH_API_URL`, `FULLSTACK_ADMIN_APP_URL`,
`FULLSTACK_USER_APP_URL`, `FULLSTACK_LANDING_APP_URL`, and
`FULLSTACK_SITE_APP_URL`. `PLAYWRIGHT_BASE_URL` may replace
`FULLSTACK_USER_APP_URL`; every other service URL remains explicit so a matrix
run cannot silently fall back to generated local ports.

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../AGENTS.md)
- [Repository architecture](../../../docs/architecture.md)
- [Command matrix](../../../docs/command-matrix.md)
- [Testing](../../../docs/testing.md)
