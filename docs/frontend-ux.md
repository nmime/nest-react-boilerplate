# Frontend UX primitives

The shared UI library includes small launch-safe primitives:

- `UiErrorBoundary` for route/subtree crash fallback; the default fallback is exposed as an assertive alert so client-side crashes are announced to assistive technology, supports custom fallbacks plus `resetKey` recovery, and calls `onError` for reporting;
- `UiLoading` for accessible loading states;
- `UiEmptyState` for not-found or empty-route content;
- `UiToast` for lightweight status messages.

React application entry points should wrap their root app tree in `UiErrorBoundary` so route-level render crashes announce a localized fallback instead of blanking the shell.

Protected routes should fail closed: render loading while auth state is unknown, redirect or show an empty state when unauthenticated, and only render privileged content after explicit role/permission checks.
