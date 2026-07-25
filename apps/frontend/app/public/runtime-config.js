// Per-deployment runtime configuration.
//
// This checked-in file is the local-development default (empty: every flag falls
// back to its Vite build-time value). In a container it is REWRITTEN at start by
// docker/frontend-runtime-config.sh from the deployment environment, which is how
// one immutable image serves many environments.
//
// Never put secrets here — it is served to every browser.
window.__APP_RUNTIME_CONFIG__ = {};
