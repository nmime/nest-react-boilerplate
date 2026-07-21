import { Injectable } from '@nestjs/common';
import type {
  NotificationSegmentResolver,
  NotificationSegmentResolverMetadata,
} from '@app/backend-feature-notification-shared';
import { AuthUsersNotificationSegmentResolver } from './auth-users-notification-segment.resolver';

@Injectable()
export class NotificationSegmentResolverRegistry {
  private readonly resolvers: ReadonlyMap<string, NotificationSegmentResolver>;

  constructor(authUsers: AuthUsersNotificationSegmentResolver) {
    this.resolvers = new Map([[authUsers.key, authUsers]]);
  }

  resolve(key: string): NotificationSegmentResolver | undefined {
    return this.resolvers.get(key);
  }

  list(): NotificationSegmentResolverMetadata[] {
    return [...this.resolvers.values()].map(({ key, label, parameterSchema }) => ({ key, label, parameterSchema }));
  }
}
