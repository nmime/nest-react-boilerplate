---
paths:
  - apps/admin-shadcn/**/*.test.ts
  - apps/admin-shadcn/**/*.test.tsx
  - apps/admin-shadcn/src/testing/**
  - apps/admin-shadcn/e2e/**
---

# Frontend Testing Rules (admin-shadcn)

## Testing Strategy

Follow the testing pyramid with integration tests as the primary focus:

- **Integration tests** (primary) — test feature workflows end-to-end through the UI: render a feature, interact with it, assert on outcomes; use MSW to intercept real HTTP requests
- **Unit tests** (secondary) — test shared utilities and complex logic in isolation (`lib/`, `hooks/`, `utils/`)
- **E2E tests** (selective) — test critical user journeys in a real browser via Playwright

## Test Layering

| Layer | Test type | Tools |
|---|---|---|
| Pure logic (`lib/`, `hooks/`, `utils/`) | Unit (`.test.ts`) | Vitest |
| Components, hooks with context | Integration (`.test.tsx`) | Vitest · @testing-library/react · MSW v2 |
| Critical user journeys | E2E | Playwright |

## File Locations

- Unit and integration tests: colocated with source — `foo.ts` + `foo.test.tsx` in the same directory
- E2E tests: `apps/admin-shadcn/e2e/` at the app root, with its own `playwright.config.ts`

## Test Infrastructure (`src/testing/`)

Shared infrastructure only — test cases must not be placed here.

- `setup.ts` — global vitest setup: MSW server lifecycle, RTL `cleanup()`, `clearAuthState()` and router mock resets after each test, `next/navigation` mock via stable `mockRouter` object
- `render.tsx` — `renderWithProviders`: wraps `QueryClientProvider` with `retry: false, staleTime: 0`; use for any component that touches TanStack Query
- `auth-fixtures.ts` — `mockUser`, `mockTokens`, `mockCredentials`, `setupAuthenticatedState()`, `clearAuthState()`
- `msw/server.ts` — `setupServer(...handlers)`; started/reset/closed via `setup.ts`
- `msw/handlers/` — one file per backend context (e.g. `auth.ts`); use `@workspace/api-types` component schemas for response types

## Testing Patterns

- Test behavior and user outcomes, not implementation details
- Use MSW to intercept real HTTP requests — do not mock `fetch` or API client functions directly
- Drive tests through user interactions (`userEvent`) and assert on what the user sees
- File suffix: `.test.ts` / `.test.tsx`; always import `describe`, `it`, `expect`, `vi` explicitly from `'vitest'` — `globals` is disabled
- MSW handler responses typed via `components['schemas']['...']` from `@workspace/api-types`
- MSW server runs with `onUnhandledRequest: 'error'` — every request must have a handler
- `next/navigation` is mocked globally in `setup.ts` via a stable `mockRouter` object; access router mocks in tests via `vi.mocked(useRouter().push)` — do not re-mock `next/navigation` in individual test files
- Router mocks are cleared automatically in `afterEach` by `setup.ts`
