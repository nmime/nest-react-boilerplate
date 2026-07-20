# CI computation cache

The CI workflow uses `.github/actions/nx-cache` to persist Nx task outputs in
the GitHub Actions cache service. It is intentionally a remote cache without a
separate Nx Cloud, S3, or MinIO credential: the workflow receives no cache
token, and GitHub applies the repository and branch cache-access rules.

Each job has a stable cache scope (`quality`, `e2e`, and so on) to avoid racing
multiple cache uploads for the same key. A new commit restores the most recent
scope cache, then Nx validates every task hash before reusing an output; changed
sources, environment inputs, or declared dependencies execute normally.

Only `.nx/cache` is persisted. Do not add `.env*`, Docker credentials,
`node_modules`, test secrets, or generated deployment credentials to this cache.
Fork pull requests can restore permitted base caches, but they do not receive
deployment secrets and cannot write to the protected default-branch cache.

For an organization that requires a dedicated Nx Cloud or object-store backend,
create and scope that service outside this repository, add its token only as a
protected CI secret, and keep this GitHub cache as the no-secret fallback. Do
not put a remote-cache token in `nx.json`, source code, image build args, or
production environment files.
