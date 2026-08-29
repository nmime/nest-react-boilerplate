import { Module } from '@nestjs/common';

/**
 * Scaffold for the payments admin surface.
 *
 * Hand-imported into `admin-app-api` only — that root module already carries
 * `AdminAuthenticationGuard` (APP_GUARD) and `AdminAccessAuditInterceptor` (APP_INTERCEPTOR),
 * so every route this module mounts is authenticated, RBAC-checked, and audit-logged by the
 * host application. Admin routes never mount on the user/auth/notification surfaces.
 *
 * U9 fills the module with the provider-registry management and payment-override controllers
 * and services (credentials redacted to `{ keyId, last4, rotatedAt }`, every mutation
 * audit-logged with a before/after diff) behind the `PaymentReadPermission`,
 * `PaymentWritePermission`, and `PaymentProviderWritePermission` RBAC constants.
 */
@Module({})
export class PaymentsAdminModule {}
