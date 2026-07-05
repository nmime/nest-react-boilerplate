import { ApiExceptions } from "@app/backend-common-exception";

// Compatibility re-export: external consumers (feature controllers and the
// tooling vertical-slice generator template) import ApiExceptions from this
// package. Everything else from @app/backend-common-exception must be
// imported from the owning package directly.
export { ApiExceptions };
