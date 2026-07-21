import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { defer, from, mergeMap, type Observable } from 'rxjs';
import { requestContext } from '@app/backend-common-request-context';
import type { AuthenticatedRequest } from '@app/backend-feature-auth-shared';
import { AuditLogAdminService } from './audit-log-admin.service';

/** Fail-closed, pre-execution evidence for every authorized admin HTTP action.
 * Domain mutations additionally write their before/after audit in the same DB
 * transaction, so this interceptor is the systemic coverage net for reads and
 * future controllers rather than a replacement for transactional auditing. */
@Injectable()
export class AdminAccessAuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditLogAdminService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = request.user ?? request.auth;
    if (!principal) {
      return next.handle();
    }
    const path = request.routeOptions?.url ?? request.path ?? request.url ?? '/admin';
    return defer(() =>
      from(
        this.audit.record({
          tenantId: principal.tenantId,
          actorUserId: principal.subject,
          action: 'admin.access',
          resource: resourceForPath(path),
          metadata: {
            method: request.method ?? 'UNKNOWN',
            route: stripQuery(path),
            controller: context.getClass().name,
            handler: context.getHandler().name,
            requestId: requestContext.getRequestId(),
            ipAddress: directIp(request),
            userAgent: header(request, 'user-agent')?.slice(0, 512),
          },
        }),
      ).pipe(mergeMap(() => next.handle())),
    );
  }
}

const stripQuery = (path: string): string => path.split('?')[0] ?? '/admin';
const resourceForPath = (input: string): string => {
  const path = stripQuery(input);
  const mappings: Array<[string, string]> = [
    ['/admin/auth/login-analytics', 'admin.auth-login-analytics'],
    ['/admin/notification-templates', 'admin.notification-templates'],
    ['/admin/notification-segments', 'admin.notification-segments'],
    ['/admin/notification-broadcasts', 'admin.notification-broadcasts'],
    ['/admin/problem-presentations', 'admin.settings'],
    ['/admin/dashboard', 'admin.dashboard'],
    ['/admin/profile', 'admin.profile'],
    ['/admin/users', 'admin.users'],
    ['/admin/roles', 'admin.roles'],
    ['/admin/audit', 'admin.audit'],
  ];
  return mappings.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`))?.[1] ?? 'admin.unknown';
};
const header = (request: AuthenticatedRequest, name: string): string | undefined => {
  const value = request.headers?.[name];
  return Array.isArray(value) ? value[0] : value;
};
const directIp = (request: AuthenticatedRequest): string | undefined => request.ip ?? request.socket?.remoteAddress;
