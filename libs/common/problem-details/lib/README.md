# @app/common-problem-details

## Purpose

Defines framework-neutral RFC 9457 problem type identities and documentation metadata for API producers and root-domain documentation.

Add a custom type here before using it in an exception. Each entry owns the
stable kebab-case code, `https://example.com/problems#<code>` identity, title,
status, safe default detail, resolution guidance, and documented extension
members. `pnpm nrb init` replaces `example.com` with the product root domain.
Both apex-capable frontends render this registry at `/problems`.

## Commands

```bash
pnpm exec nx run @app/common-problem-details:test
pnpm exec nx run @app/common-problem-details:build
```
