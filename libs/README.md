# Libraries

Repository libraries live under `libs/**/lib` and are Nx project roots. Platform package manifests live at `libs/backend/package.json` and `libs/frontend/package.json`; individual library projects should not add their own package manifests unless repository policy changes.

## Platforms

- [Backend libraries](backend/README.md)
- [Frontend libraries](frontend/README.md)
- [Common libraries](common/README.md)

Each library project root has a local `README.md` and `AGENTS.md` describing ownership, tags, and supported Nx targets.
