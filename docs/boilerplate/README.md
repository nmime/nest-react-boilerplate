# Boilerplate-owned content

Everything under `docs/boilerplate/**` is about **this boilerplate**, not about
any product built from it. A fork deletes this directory.

It exists as one prefix on purpose. Before it existed, adopting the boilerplate
meant recognising and deleting the same scattered ~60 files by hand, and every
fork made a slightly different judgement about which ones.

## What is here

| Document                                                                  | Why a product does not want it                         |
| ------------------------------------------------------------------------- | ------------------------------------------------------ |
| [Quick Start](quick-start.md)                                             | Onboarding _to the boilerplate_, not to your product   |
| [Launching a New Project](new-project.md)                                 | The fork procedure — spent once, on the way in         |
| [Technology Choices](technology-choices.md)                               | Records why the boilerplate picked its stack           |
| [Auth Production Gap Register](auth-production-roadmap.md)                | Roadmap for work the boilerplate has not built         |
| [Billing Extension and Admin Capability Status](billing-admin-roadmap.md) | Roadmap for work the boilerplate has not built         |
| [Admin notification broadcasts](admin-notification-broadcasts-spec.md)    | Spec for a feature the boilerplate has not built       |
| [TypeScript 7 Upgrade](upgrade-typescript-7.md)                           | Compiler-upgrade research pinned to an upstream moment |

## Also boilerplate-owned, outside this prefix

These could not move without breaking tooling that hardcodes their path, so they
are declared here instead. A fork deletes them too.

| Path                          | Held in place by                                                         |
| ----------------------------- | ------------------------------------------------------------------------ |
| `docs/superpowers/**`         | Path is hardcoded in `scripts/validate-doc-links.mjs` and `static-check` |
| `CHANGELOG.md`                | Path is hardcoded in two doc-tooling scripts                             |
| `docs/assets/readme-hero.svg` | Referenced by the root `README.md` header                                |
| `openspec/changes/archive/**` | The boilerplate's own completed change proposals                         |
| `.mailmap`                    | Canonicalises the boilerplate's historical contributors                  |

## Pruning

```bash
rm -rf docs/boilerplate docs/superpowers openspec/changes/archive
rm -f CHANGELOG.md docs/assets/readme-hero.svg
```

Then remove the references that kept docs make into the prefix. This list is
short by design — a document outside the prefix that links into it is a bug, so
keep this list at zero-plus-exceptions rather than letting it grow:

- `docs/README.md` — the whole "Boilerplate-owned content" section
- `docs/notifications.md` — the "Admin notification broadcasts" paragraph
- `docs/usage/adding-an-auth-provider.md` — two "Auth Production Gap Register" links
- `README.md` — the hero image and the Quick Start / Launching a New Project links
- `CONTRIBUTING.md` — the `CHANGELOG.md` paragraph under "Release notes"

Finally run `pnpm run docs:check`, which fails on any link left dangling.

## Related

- [Product identity](../product-identity.md) — the rename path and the placeholder-residue gate.
