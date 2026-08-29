# Reconfigure a generated product

The repository owns one schema-v2 `nrb.config.json`. Change product identity,
application names, runtime ports, session or seed defaults there, then run:

```sh
pnpm nrb reconfigure --config nrb.config.json
```

The command applies anchored rewrites, regenerates `docs/PORTS.md`, and executes
the ordered verification gate. A failed gate names the failed step, exits
non-zero and restores the complete pre-run tree. The applied manifest records
`gate: green`; `--gate off` is the logged CI-only escape hatch and records
`gate: skipped`.

Use `pnpm nrb reconfigure --audit` for the offline consistency check covering
Compose services, bake targets, Helm app values, PM2 scripts, generated ports,
proxy targets, TypeScript aliases and Nx project names.

The tooling suite includes the round-trip contract: apply a fixture identity
(`acme-platform`, admin API port `3101`), restore the committed config, reapply,
and require an empty Git diff.
