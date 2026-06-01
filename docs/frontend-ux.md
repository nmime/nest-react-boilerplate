# Frontend UX primitives

The shared UI library includes small launch-safe primitives:

- `UiErrorBoundary` for route/subtree crash fallback; the default fallback is exposed as an assertive alert so client-side crashes are announced to assistive technology;
- `UiLoading` for accessible loading states;
- `UiEmptyState` for not-found or empty-route content;
- `UiToast` for lightweight status messages.

Protected routes should fail closed: render loading while auth state is unknown, redirect or show an empty state when unauthenticated, and only render privileged content after explicit role/permission checks.
