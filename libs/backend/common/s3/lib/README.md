# @app/backend-common-s3

## Purpose

AWS SDK v3-backed object-storage boundary for AWS S3 and S3-compatible
providers. `S3Module.forRoot()` creates the production adapter from the
canonical `S3_*` environment variables. Tests and specialized consumers can
pass an explicit `ObjectStorageClient`; the in-memory client is never selected
implicitly at runtime.

The configured bucket must already exist. `S3Service` uses `S3_BUCKET` by
default; an operation can explicitly choose another product-owned bucket.

## Configuration

| Variable                          | Purpose                                                              |
| --------------------------------- | -------------------------------------------------------------------- |
| `S3_ENDPOINT`                     | Optional custom endpoint, including SeaweedFS.                       |
| `S3_REGION`                       | SDK region; defaults to `us-east-1`.                                 |
| `S3_BUCKET`                       | Product's default bucket name.                                       |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | Optional static credential pair; configure both or neither.          |
| `S3_FORCE_PATH_STYLE`             | Enables path-style addressing for providers such as local SeaweedFS. |

## Commands

```bash
pnpm exec nx run @app/backend-common-s3:build
pnpm exec nx run @app/backend-common-s3:test
```

The normal unit suite skips the live-server spec. The component lane starts
its own isolated SeaweedFS container with test-only credentials, creates a bucket,
verifies put/get/list/delete and missing-object behavior, rejects invalid signed
and anonymous writes, checks the admin login redirect, and cleans up its container:

```bash
pnpm exec nx run @app/backend-common-s3:component-test --skip-nx-cache
```

The local Compose `s3` profile uses the same digest-pinned SeaweedFS image. It
creates `S3_BUCKET` on startup, maps S3 on loopback port 9000 and the authenticated
admin UI on loopback port 9001, and disables unused WebDAV, Iceberg, Lance and
filer/master HTTP gateways. Its example credentials are for local development;
production configuration selects an external, properly secured S3 provider.

The retired MinIO volume is never mounted by SeaweedFS. Existing product forks
must copy objects through the S3 API into a fresh store before switching endpoints;
the two servers have incompatible on-disk formats. Migrate `runtime.minio` to
`runtime.s3`, runtime port keys `minio` / `minio-console` to `s3` / `s3-admin`, and
Compose port overrides to `S3_PORT` / `S3_ADMIN_PORT`; server credentials now use
the canonical `S3_ACCESS_KEY` / `S3_SECRET_KEY` pair. Regenerate setup artifacts
from the migrated configuration. No deployed data is automatically rewritten.

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../../AGENTS.md)
- [Repository architecture](../../../../../docs/architecture.md)
- [Command matrix](../../../../../docs/command-matrix.md)
- [Testing](../../../../../docs/testing.md)
- [API contracts](../../../../../docs/api-contracts.md)
