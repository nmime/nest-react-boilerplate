import { permissionCatalog } from '@app/common-authz';

// Canonical ordering index for permission keys, sourced from the shared catalog
// so admin views present permissions in a stable, catalog-defined sequence.
export const permissionCatalogOrder = new Map<string, number>(
  permissionCatalog.map((permission, index) => [permission.key, index]),
);
