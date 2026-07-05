import { permissionCatalogOrder } from "../const";
import type { AdminRolePermissionView } from "../../domain";

const byCatalogIndex =
  <T>(toKey: (value: T) => string) =>
  (left: T, right: T): number => {
    const leftIndex =
      permissionCatalogOrder.get(toKey(left)) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex =
      permissionCatalogOrder.get(toKey(right)) ?? Number.MAX_SAFE_INTEGER;

    return leftIndex === rightIndex
      ? toKey(left).localeCompare(toKey(right))
      : leftIndex - rightIndex;
  };

export const orderPermissionKeys = (keys: readonly string[]): string[] =>
  [...new Set(keys)].sort(byCatalogIndex((key) => key));

export const orderPermissionViews = (
  views: AdminRolePermissionView[],
): AdminRolePermissionView[] =>
  [...views].sort(byCatalogIndex((view) => view.permission));
