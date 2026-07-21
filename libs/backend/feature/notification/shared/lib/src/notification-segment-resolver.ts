import type { NotificationAudienceMember, NotificationData } from '@app/common-notifications';

export interface NotificationSegmentResolverMetadata {
  key: string;
  label: string;
  parameterSchema: Record<string, unknown>;
}

export interface NotificationSegmentResolveInput {
  tenantId: string;
  parameters: NotificationData;
  snapshotAt: Date;
}

export interface NotificationSegmentResolvePageInput extends NotificationSegmentResolveInput {
  cursor?: string;
  limit: number;
}

export interface NotificationSegmentResolvePage {
  members: NotificationAudienceMember[];
  nextCursor?: string;
}

export abstract class NotificationSegmentResolver {
  abstract readonly key: string;
  abstract readonly label: string;
  abstract readonly parameterSchema: Record<string, unknown>;
  abstract estimate(input: NotificationSegmentResolveInput): Promise<number>;
  abstract resolvePage(input: NotificationSegmentResolvePageInput): Promise<NotificationSegmentResolvePage>;
}
