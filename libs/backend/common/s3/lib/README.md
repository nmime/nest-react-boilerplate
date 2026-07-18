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

| Variable                          | Purpose                                                          |
| --------------------------------- | ---------------------------------------------------------------- |
| `S3_ENDPOINT`                     | Optional custom endpoint, including MinIO.                       |
| `S3_REGION`                       | SDK region; defaults to `us-east-1`.                             |
| `S3_BUCKET`                       | Product's default bucket name.                                   |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | Optional static credential pair; configure both or neither.      |
| `S3_FORCE_PATH_STYLE`             | Enables path-style addressing for providers such as local MinIO. |

## Commands

```bash
pnpm exec nx run @app/backend-common-s3:build
pnpm exec nx run @app/backend-common-s3:test
```

The normal suite keeps the live-server spec skipped. To prove the adapter
against local MinIO, start the Compose `s3` profile and run:

```bash
S3_INTEGRATION_TEST=true \
S3_ENDPOINT=http://127.0.0.1:9000 \
S3_REGION=us-east-1 \
S3_ACCESS_KEY=minioadmin \
S3_SECRET_KEY=minioadmin \
S3_FORCE_PATH_STYLE=true \
pnpm exec nx run @app/backend-common-s3:test
```

The live spec creates an isolated bucket, verifies put/get/list/delete and the
missing-object result, then removes the bucket.

## Docs

- [Local agent rules](AGENTS.md)
- [Platform agent rules](../../../AGENTS.md)
- [Repository architecture](../../../../../docs/architecture.md)
- [Command matrix](../../../../../docs/command-matrix.md)
- [Testing](../../../../../docs/testing.md)
- [API contracts](../../../../../docs/api-contracts.md)
