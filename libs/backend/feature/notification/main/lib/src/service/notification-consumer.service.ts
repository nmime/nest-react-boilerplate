import { Injectable, Logger, type BeforeApplicationShutdown, type OnApplicationBootstrap } from '@nestjs/common';
import { S3Service } from '@app/backend-common-s3';
import { NotificationBroadcastPersistence } from '@app/backend-feature-notification-shared';
import { NotificationSegmentKind, type NotificationAudienceMember } from '@app/common-notifications';
import { NotificationConfigService } from '../config';
import { NotificationCsvService } from './notification-csv.service';
import { NotificationSegmentResolverRegistry } from './notification-segment-resolver-registry.service';

@Injectable()
export class NotificationConsumerService implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(NotificationConsumerService.name);
  private readonly intervalMs: number;
  private readonly materializationChunkSize: number;
  private readonly csvLimits: { maxBytes: number; maxRows: number };
  private timer?: NodeJS.Timeout;
  private iteration?: Promise<void>;
  private stopped = false;
  private running = false;

  constructor(
    config: NotificationConfigService,
    private readonly persistence: NotificationBroadcastPersistence,
    private readonly objectStorage: S3Service,
    private readonly csv: NotificationCsvService,
    private readonly resolvers: NotificationSegmentResolverRegistry,
  ) {
    this.intervalMs = config.broadcasts.consumerIntervalMs;
    this.materializationChunkSize = config.broadcasts.materializationChunkSize;
    this.csvLimits = { maxBytes: config.broadcasts.csvMaxBytes, maxRows: config.broadcasts.csvMaxRows };
  }

  onApplicationBootstrap(): void {
    this.schedule(0);
  }

  async beforeApplicationShutdown(): Promise<void> {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
    }
    await this.iteration;
  }

  async runOnce(): Promise<number> {
    let handled = 0;
    if (await this.processUpload()) {
      handled += 1;
    }
    if (await this.processSnapshot()) {
      handled += 1;
    }
    const materialization = await this.persistence.claimBroadcastMaterialization(this.materializationChunkSize);
    if (materialization) {
      handled += await this.persistence.materializeBroadcastMembers(materialization);
    }
    return handled;
  }

  private schedule(delay: number): void {
    if (this.stopped) {
      return;
    }
    this.timer = setTimeout(() => {
      const iteration = this.iterate();
      this.iteration = iteration;
      void iteration.finally(() => {
        if (this.iteration === iteration) {
          this.iteration = undefined;
        }
      });
    }, delay);
    this.timer.unref();
  }

  private async iterate(): Promise<void> {
    if (this.running || this.stopped) {
      return;
    }
    this.running = true;
    let handled = 0;
    try {
      handled = await this.runOnce();
    } catch (error) {
      this.logger.error('Notification consumer iteration failed', safeStack(error));
    } finally {
      this.running = false;
      this.schedule(handled > 0 ? 0 : this.intervalMs);
    }
  }

  private async processUpload(): Promise<boolean> {
    const upload = await this.persistence.claimSegmentUpload(new Date());
    if (!upload) {
      return false;
    }
    try {
      const object = await this.objectStorage.getObject({ key: upload.objectKey });
      if (!object) {
        throw new Error('notification_csv_object_missing');
      }
      const parsed = this.csv.parse(object.body, this.csvLimits);
      await this.persistence.completeSegmentUpload({ uploadId: upload.id, claimToken: upload.claimToken, ...parsed });
    } catch (error) {
      this.logger.warn(`Notification CSV upload ${upload.id} failed: ${safeMessage(error)}`);
      await this.persistence.failSegmentUpload(upload.id, upload.claimToken, [safeMessage(error)]);
    }
    return true;
  }

  private async processSnapshot(): Promise<boolean> {
    const context = await this.persistence.claimSnapshot(new Date());
    if (!context) {
      return false;
    }
    try {
      const members: NotificationAudienceMember[] = [];
      for (const segment of context.segments) {
        if (segment.kind === NotificationSegmentKind.Static) {
          // Segment order is deterministic and collection is intentionally sequential.
          // eslint-disable-next-line no-await-in-loop
          members.push(...(await this.persistence.listStaticSegmentMembers(segment.id)));
          continue;
        }
        const resolver = segment.resolverKey ? this.resolvers.resolve(segment.resolverKey) : undefined;
        if (!resolver) {
          throw new Error(`notification_segment_resolver_missing:${segment.resolverKey ?? ''}`);
        }
        let cursor: string | undefined;
        do {
          // Pages are sequential so each cursor is evaluated against the same fixed snapshot boundary.
          // eslint-disable-next-line no-await-in-loop
          const page = await resolver.resolvePage({
            tenantId: segment.tenantId,
            parameters: segment.parameters,
            snapshotAt: context.snapshot.snapshotAt,
            cursor,
            limit: 500,
          });
          members.push(...page.members);
          cursor = page.nextCursor;
        } while (cursor);
      }
      await this.persistence.completeSnapshot(context.snapshot.id, context.claimToken, members);
    } catch (error) {
      this.logger.warn(`Notification audience snapshot ${context.snapshot.id} failed: ${safeMessage(error)}`);
      await this.persistence.failSnapshot(context.snapshot.id, context.claimToken, safeMessage(error));
    }
    return true;
  }
}

function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : 'Unknown notification consumer failure.';
}

function safeStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined;
}
