# Adding a New Frontend Page

Step-by-step guide to adding a route and page to one of the frontend apps.

## 1. Pick the target app

| App           | Path                    | Framework         | Use case               |
| ------------- | ----------------------- | ----------------- | ---------------------- |
| `admin-app`   | `apps/frontend/admin`   | React + Vite      | Admin dashboard pages  |
| `user-app`    | `apps/frontend/app`     | React + Vite      | User-facing pages      |
| `landing-app` | `apps/frontend/landing` | Astro             | Public marketing pages |
| `site-app`    | `apps/frontend/site`    | Vike + React SSR  | SSR product/user pages |
| `mobile-app`  | `apps/frontend/mobile`  | Expo/React Native | Mobile app screens     |

## 2. Scaffold with the feature generator (recommended)

The feature generator creates a React page stub in `apps/frontend/app/src/app/features/<name>/`:

```bash
nrb add feature my-feature --dry-run
nrb add feature my-feature
```

This creates:

- Backend shared DTOs and NestJS module.
- PostgreSQL entity and migration.
- Frontend API client stub.
- **React page stub** at `apps/frontend/app/src/app/features/my-feature/`.

## 3. Manual page creation

If you don't need a full vertical slice, create the page manually:

### For Vite SPAs (admin-app, user-app)

```bash
mkdir -p apps/frontend/app/src/app/features/my-feature/
```

Create `apps/frontend/app/src/app/features/my-feature/my-feature-page.tsx`:

```tsx
import { useState } from 'react';

export function MyFeaturePage() {
  const [loading, setLoading] = useState(false);

  return (
    <div>
      <h1>My Feature</h1>
      {loading ? <p>Loading...</p> : <p>Content here</p>}
    </div>
  );
}
```

### For Astro (landing-app)

Create `apps/frontend/landing/src/pages/my-feature.astro`:

```astro
---
// Astro page
---

<html>
  <head><title>My Feature</title></head>
  <body>
    <h1>My Feature</h1>
  </body>
</html>
```

### For Vike SSR (site-app)

Create route files in `apps/frontend/site/pages/my-feature/`:

```typescript
// apps/frontend/site/pages/my-feature/page.tsx
export default function MyFeaturePage() {
  return <h1>My Feature</h1>;
}

// apps/frontend/site/pages/my-feature/config.ts
export default {
  title: 'My Feature',
};
```

### For Expo/React Native (mobile-app)

Add a screen to the navigation stack in `apps/frontend/mobile/src/navigation/` and create the screen component.

## 4. Wire the route

Add the page to the owning app's route tree:

### Vite SPAs (React Router)

Edit `apps/frontend/app/src/app/routes.tsx` (or the router configuration):

```tsx
import { lazy, Suspense } from 'react';

const MyFeaturePage = lazy(() => import('./features/my-feature/my-feature-page'));

// Add to routes array:
{
  path: '/my-feature',
  element: (
    <Suspense fallback={<div>Loading...</div>}>
      <MyFeaturePage />
    </Suspense>
  ),
}
```

### Astro

Pages in `src/pages/` are automatically routed by Astro.

### Vike

Pages in `pages/` are automatically routed by Vike.

## 5. Use shared UI primitives

Import from `@app/frontend-ui-web` for shared components:

```tsx
import { Button, Card } from '@app/frontend-ui-web';
```

For mobile, use `@app/frontend-ui-native`.

## 6. Add API integration

If the page needs backend data, use the generated API client:

```tsx
import { useMyFeatureClient } from '@app/frontend-api-client';

export function MyFeaturePage() {
  const { data, isLoading, error } = useMyFeatureClient();

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      {data.map((item) => (
        <Card key={item.id}>{item.name}</Card>
      ))}
    </div>
  );
}
```

## 7. Add tests

### Unit test

```typescript
// apps/frontend/app/src/app/features/my-feature/my-feature-page.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MyFeaturePage } from './my-feature-page';

describe('MyFeaturePage', () => {
  it('renders the page title', () => {
    render(<MyFeaturePage />);
    expect(screen.getByRole('heading', { name: 'My Feature' })).toBeDefined();
  });
});
```

### Storybook story

```tsx
// apps/frontend/app/src/app/features/my-feature/my-feature-page.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { MyFeaturePage } from './my-feature-page';

const meta: Meta<typeof MyFeaturePage> = {
  component: MyFeaturePage,
};

export default meta;
type Story = StoryObj<typeof MyFeaturePage>;

export const Default: Story = {};
```

## 8. Validate

```bash
# Typecheck:
nx typecheck user-app

# Lint:
nx lint user-app

# Test:
nx test user-app

# Build:
nx build user-app

# Serve:
nx serve user-app
```

## 9. Refresh API contracts (if backend changed)

```bash
pnpm api:openapi
pnpm api:contracts
pnpm api:clients
```

## Next steps

- [First Feature Walkthrough](../first-feature-walkthrough.md) — full vertical slice walkthrough.
- [Adding a New Service](adding-a-new-service.md) — create the backend counterpart.
- [Frontend FSD](../frontend-fsd.md) — Feature-Sliced Design boundaries.
