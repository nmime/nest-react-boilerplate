import { Injectable } from '@nestjs/common';
import {
  NotificationSegmentResolver,
  type NotificationSegmentResolveInput,
  type NotificationSegmentResolvePage,
  type NotificationSegmentResolvePageInput,
} from '@app/backend-feature-notification-shared';
import { AuthUserRepository } from '@app/backend-postgres-main-auth';
import { NotificationTargetType, type NotificationData } from '@app/common-notifications';

@Injectable()
export class AuthUsersNotificationSegmentResolver extends NotificationSegmentResolver {
  readonly key = 'auth-users';
  readonly label = 'Application users';
  readonly parameterSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      status: { enum: ['active', 'disabled', 'invited'] },
      locale: { enum: ['en', 'ru'] },
      role: { type: 'string' },
      permission: { type: 'string' },
      registeredAfter: { type: 'string', format: 'date-time' },
      registeredBefore: { type: 'string', format: 'date-time' },
      lastLoginAfter: { type: 'string', format: 'date-time' },
      lastLoginBefore: { type: 'string', format: 'date-time' },
    },
  } as const;

  constructor(private readonly users: AuthUserRepository) {
    super();
  }

  async estimate(input: NotificationSegmentResolveInput): Promise<number> {
    const result = await this.users.countUsers(toUserFilters(input));
    if (result.isErr()) {
      throw new Error('notification_segment_resolver_failed');
    }
    return result.value;
  }

  async resolvePage(input: NotificationSegmentResolvePageInput): Promise<NotificationSegmentResolvePage> {
    const offset = parseCursor(input.cursor);
    const result = await this.users.listUsers({
      ...toUserFilters(input),
      limit: input.limit,
      offset,
    });
    if (result.isErr()) {
      throw new Error('notification_segment_resolver_failed');
    }
    const members = result.value.map((user) => ({
      targetType: NotificationTargetType.User,
      targetId: user.id,
      language: user.locale,
      variables: {
        displayName: user.displayName,
        email: user.email,
      },
    }));
    return {
      members,
      ...(members.length === input.limit ? { nextCursor: String(offset + members.length) } : {}),
    };
  }
}

function toUserFilters(input: NotificationSegmentResolveInput): {
  tenantId: string;
  status?: 'active' | 'disabled' | 'invited';
  locale?: 'en' | 'ru';
  role?: string;
  permission?: string;
  createdAfter?: Date;
  createdBefore: Date;
  lastLoginAfter?: Date;
  lastLoginBefore?: Date;
} {
  const parameters = input.parameters;
  return {
    tenantId: input.tenantId,
    ...(isOneOf(parameters['status'], ['active', 'disabled', 'invited']) ? { status: parameters['status'] } : {}),
    ...(isOneOf(parameters['locale'], ['en', 'ru']) ? { locale: parameters['locale'] } : {}),
    ...(typeof parameters['role'] === 'string' ? { role: parameters['role'] } : {}),
    ...(typeof parameters['permission'] === 'string' ? { permission: parameters['permission'] } : {}),
    ...(dateParameter(parameters, 'registeredAfter')
      ? { createdAfter: dateParameter(parameters, 'registeredAfter') }
      : {}),
    createdBefore: dateParameter(parameters, 'registeredBefore') ?? input.snapshotAt,
    ...(dateParameter(parameters, 'lastLoginAfter')
      ? { lastLoginAfter: dateParameter(parameters, 'lastLoginAfter') }
      : {}),
    ...(dateParameter(parameters, 'lastLoginBefore')
      ? { lastLoginBefore: dateParameter(parameters, 'lastLoginBefore') }
      : {}),
  };
}

function dateParameter(parameters: NotificationData, key: string): Date | undefined {
  const value = parameters[key];
  if (typeof value !== 'string') {
    return undefined;
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new Error(`notification_segment_invalid_parameter:${key}`);
  }
  return new Date(timestamp);
}

function parseCursor(cursor?: string): number {
  if (!cursor) {
    return 0;
  }
  const value = Number(cursor);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('notification_segment_invalid_cursor');
  }
  return value;
}

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === 'string' && options.includes(value as T);
}
