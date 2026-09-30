# Discovery

The completed source audit identified ordinary correctness gaps beyond the nine
validated security findings. They span repeatable setup, generated option and
port boundaries, provider fixture isolation, deployment plans and readiness,
quality evidence, localization, notification transactions, payment activation,
telemetry privacy, and skills/documentation ownership. Each repair stays in its
existing owner and retains the durable requirement identifiers.

The first traced failure is `updateSelection`: it constructs a new parsed config
without the existing product namespaces. Interactive setup similarly passes only
operational flags to `buildConfig`. The tenant guard references a potentially
absent migration relation inside CASE; PostgreSQL resolves that reference before
the CASE branch can protect it. These boundaries need real product configuration
and owned database counterexamples.

Main and production remain read-only. Existing source audit evidence is an
immutable baseline; development diagnostics and final exact-revision assurance
are separate evidence. Hosted providers, physical devices, and production
acceptance remain external prerequisites.
