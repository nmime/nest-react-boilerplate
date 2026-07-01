# Deterministic Seed Factory Tooling

Zero-dependency, deterministic seed factory primitives for generating reproducible
test data. No randomness, no secrets, no external packages (`faker`, `uuid`, etc.).

## Why

The existing `seed.ts` uses `randomUUID()` and `randomBytes()`, which is correct for
production seeding but breaks test reproducibility. These factories provide a
predictable alternative for:

- **Component tests** that need stable fixture records.
- **E2E tests** that need deterministic baseline data.
- **Seed commands** where identical output across runs matters.
- **Debugging** where non-deterministic IDs obscure root causes.

## API

### `defineSequence(start = 1)`

Create a deterministic incrementing integer sequence.

```ts
import { defineSequence } from './seed-factories.ts';

const seq = defineSequence(); // starts at 1
seq.next(); // 2
seq.next(); // 3
seq.current; // 3
seq.reset();
seq.next(); // 2 (starts from 1, next returns 2)
```

### `createFactory(definition)`

Build a factory that produces deterministic records.

```ts
import { createFactory, defineSequence } from './seed-factories.ts';

const seq = defineSequence();

const userFactory = createFactory({
  id: () => `user_${seq.next()}`,
  email: () => `user${seq.next()}@example.com`,
  displayName: 'Default User',  // static value
  role: () => 'user',
});

userFactory.build();        // { id: 'user_1', email: 'user1@...', ... }
userFactory.buildList(3);   // [{ id: 'user_2', ... }, { id: 'user_3', ... }, ...]
userFactory.build({ role: 'admin' }); // override individual attributes
```

### `createFactoryWithTraits(definition, traits)`

Factory with named trait support.

```ts
const factory = createFactoryWithTraits(
  { id: () => `u_${seq.next()}`, role: 'user', status: 'active' },
  { admin: { role: 'admin' }, deactivated: { status: 'deactivated' } },
);

factory.buildWith(['admin']); // { id: 'u_1', role: 'admin', status: 'active' }
factory.buildWith(['admin', 'deactivated']); // { ..., role: 'admin', status: 'deactivated' }
factory.buildWith(['admin', { status: 'pending' }]); // inline override after traits
factory.buildListWith(3, ['admin']); // 3 records, all with role: 'admin'
```

### `resetFactory(factory)`

Reset a factory's sequence for test isolation.

```ts
resetFactory(userFactory);
// Next build will produce the same values as the first build.
```

### `createGlobalFactory(definition)`

Factory that uses the module-level `globalSequence`. Reset `globalSequence`
between tests.

## Using in Component/E2E Tests

```ts
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createFactory, defineSequence, resetFactory } from '@repo/tooling/commands/db/seed-factories';

const seq = defineSequence();
const userFactory = createFactory({
  id: () => `u_${seq.next()}`,
  email: () => `test${seq.next()}@example.com`,
  displayName: 'Test User',
  status: 'active',
  roles: () => ['user'],
});

describe('auth component', () => {
  beforeEach(() => resetFactory(userFactory));

  it('creates a user', () => {
    const user = userFactory.build();
    assert.equal(user.id, 'u_1'); // always the same
    assert.equal(user.email, 'test1@example.com');
  });
});
```

## Using in Seed Commands

```ts
import {
  createFactory,
  createFactoryWithTraits,
} from './seed-factories.ts';

const seq = defineSequence();

const userFactory = createFactory({
  id: () => `seed_u_${seq.next()}`,
  email: () => `seed${seq.next()}@example.com`,
  displayName: () => `Seed User ${seq.next()}`,
  passwordHash: 'pbkdf2_sha256$120000$salt$hash',
  status: 'active',
  roles: () => ['user'],
  permissions: () => ['profile:read'],
});

// Generate consistent seed data
const seedUsers = userFactory.buildList(10);
```

## Using with the Existing `seed.ts`

The factory helpers can be imported alongside the existing seed command. They
don't replace `seed.ts` but provide a complementary deterministic data layer:

```ts
import { createFactory, defineSequence } from './seed-factories.ts';

// In a seed command, use factories for non-admin test data:
const seq = defineSequence();
const testUserFactory = createFactory({
  id: () => `test_${seq.next()}`,
  // ...
});
```

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| No `faker`/random packages | Dependency campaign active; zero-new-deps policy |
| No `Math.random()` or `crypto` | Determinism is the core guarantee |
| No `Date.now()` timestamps | Non-deterministic across runs |
| Sequence starts at 1 (not 0) | Convention match with database auto-increment |
| `@ts-nocheck` tests | Matches existing tooling test conventions |
| Exposed through `@repo/tooling/commands/*` | Follows existing tooling exports pattern |

## Testing

```bash
# Run the factory tests directly
node --import jiti/register packages/tooling/src/commands/db/seed-factories.test.ts

# Or through the test runner
pnpm test -- --filter packages/tooling/src/commands/db/seed-factories.test.ts
```

All tests verify:
- Deterministic sequence behavior
- Factory build/override/buildList/buildWith correctness
- Trait merging and inheritance
- No hidden randomness (source code scan)
- Integration with existing auth_users patterns
