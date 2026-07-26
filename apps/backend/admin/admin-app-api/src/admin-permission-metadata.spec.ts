// @requirements REQ-AUTH-TENANT-004
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import {
  AdminProblemPresentationsController,
  AdminProfileController,
  AdminRolesController,
  AdminUsersController,
} from '@app/backend-feature-admin-main';
import { AuditLogAdminController } from '@app/backend-feature-audit-log-admin';
import { AdminRole, isKnownAdminPermission } from '@app/backend-feature-admin-shared';
import { AuthLoginAnalyticsAdminController } from '@app/backend-feature-auth-admin';
import { RequiredPermissionsMetadataKey, RequiredRolesMetadataKey } from '@app/backend-feature-auth-shared';
import { AdminNotificationsController } from '@app/backend-feature-notification-admin';

type ControllerClass = { name: string; prototype: unknown };
type HttpHandler = ((...args: never[]) => unknown) & { readonly name: string };

const adminControllers: ControllerClass[] = [
  AdminProfileController,
  AdminUsersController,
  AdminRolesController,
  AdminProblemPresentationsController,
  AuditLogAdminController,
  AuthLoginAnalyticsAdminController,
  AdminNotificationsController,
];

const permissionsFor = (controller: ControllerClass, handler?: HttpHandler): string[] => [
  ...(Reflect.getMetadata(RequiredPermissionsMetadataKey, controller) ?? []),
  ...(handler ? (Reflect.getMetadata(RequiredPermissionsMetadataKey, handler) ?? []) : []),
];

const httpHandlersFor = (controller: ControllerClass): HttpHandler[] => {
  const prototype = controller.prototype as Record<string, unknown>;

  return Object.getOwnPropertyNames(prototype)
    .filter((name) => name !== 'constructor')
    .map((name) => Object.getOwnPropertyDescriptor(prototype, name)?.value)
    .filter(
      (value): value is HttpHandler =>
        typeof value === 'function' &&
        (Reflect.hasMetadata(PATH_METADATA, value) || Reflect.hasMetadata(METHOD_METADATA, value)),
    );
};

describe('admin endpoint authorization metadata', () => {
  it('requires at least one explicit permission on every composed admin HTTP handler', () => {
    for (const controller of adminControllers) {
      const handlers = httpHandlersFor(controller);
      expect(handlers, `${controller.name} must expose at least one HTTP handler`).not.toHaveLength(0);
      for (const handler of handlers) {
        const permissions = permissionsFor(controller, handler);
        expect(permissions, `${controller.name}.${handler.name} is missing RequirePermissions`).not.toHaveLength(0);
        for (const permission of permissions) {
          expect(
            isKnownAdminPermission(permission),
            `${controller.name}.${handler.name} uses unknown or non-admin permission ${permission}`,
          ).toBe(true);
        }
      }
    }
  });

  it('does not retain a static admin-role gate on a permission-authorized admin controller', () => {
    for (const controller of adminControllers) {
      const classRoles = Reflect.getMetadata(RequiredRolesMetadataKey, controller) ?? [];
      expect(classRoles, `${controller.name} must use DB-resolved permissions instead of AdminRole`).not.toContain(
        AdminRole,
      );
      for (const handler of httpHandlersFor(controller)) {
        const handlerRoles = Reflect.getMetadata(RequiredRolesMetadataKey, handler) ?? [];
        expect(
          handlerRoles,
          `${controller.name}.${handler.name} must use DB-resolved permissions instead of AdminRole`,
        ).not.toContain(AdminRole);
      }
    }
  });
});
