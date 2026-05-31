# Frontend UX primitives

The shared UI library includes small launch-safe primitives:

- `UiErrorBoundary` for route/subtree crash fallback;
- `UiLoading` for accessible loading states;
- `UiEmptyState` for not-found or empty-route content;
- `UiToast` for lightweight status messages.

Protected routes should fail closed: render loading while auth state is unknown, redirect or show an empty state when unauthenticated, and only render privileged content after explicit role/permission checks.
