---
name: change-i18n
description: Add or change translated frontend and backend copy without catalog drift. Use for locale keys, message catalogs, RFC 9457 localization, UI copy, template translations, locale negotiation, and parity checks.
---

# Change internationalization

## Read first

- Read `../../../docs/i18n.md`, locate the owning catalog and locale type contract, and inspect every consumer of the changed key.
- Determine whether copy is product UI, backend problem detail, validation text, or notification-template content; keep it in that owner.

## Workflow

1. Add semantic keys to the canonical catalog rather than embedding user-visible strings in components, controllers, or domain services.
2. Update every supported locale in the same change. Preserve placeholders, plural/select structure, markup policy, and escaping across translations.
3. Keep standard RFC 9457 title/detail localization in the problem-details system and set `Content-Language` through existing negotiation.
4. Avoid concatenating translated fragments or using user input as a translation key.
5. Test locale fallback, interpolation, missing-key behavior, direction/layout impact when relevant, and at least one rendered consumer.
6. Update snapshots only after reviewing the intended copy and structure.

## Verification

Run the repository i18n check, owning frontend/backend tests, relevant Storybook or e2e lane, builds, and `git diff --check`. Report any untranslated external-provider copy separately.
