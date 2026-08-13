import { randomUUID } from 'node:crypto';
import { Injectable, Logger, Optional, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { RedisConfigService } from './config';
import { InjectRedis } from './decorator';
import type { RedisClientLike, RedisOwnedValueClient } from './type';

const redisOperationTimeoutMs = 1_000;
const completedValue = 'completed';

/** What a redelivery of a callback that was already processed successfully should do. */
export type InboundCallbackCompletedPolicy = 'skip' | 'reject';

/**
 * The problem codes this ingress reports. They reach the provider and the product's own clients,
 * so they belong to the ingress rather than to the mechanism.
 */
export interface InboundCallbackProblemCodes {
  /** The delivery is already being processed, or was processed and the ingress rejects redeliveries. */
  replayed: string;
  /** The replay store could not answer, so the delivery cannot be admitted. */
  unavailable: string;
  /** The processing lease expired and another worker took it before this one finished. */
  reservationLost: string;
}

/**
 * One inbound provider callback surface.
 *
 * Everything that differs between two ingresses is here: the key namespace, how long a delivery may
 * be in flight, how long a completed delivery is remembered, what a redelivery of a completed one
 * does, and the codes it reports. The mechanism below is the same for all of them.
 */
export interface InboundCallbackIngress {
  /** Key segments identifying the ingress; joined with `:` ahead of the delivery id. */
  namespace: readonly string[];
  /** How long one attempt may hold the delivery before another worker may retry it. */
  processingTtlMs: number;
  /** How long a completed delivery stays known, which bounds the redelivery window it covers. */
  completedTtlMs: number;
  onCompleted: InboundCallbackCompletedPolicy;
  codes: InboundCallbackProblemCodes;
}

/**
 * An ingress that refuses redeliveries of a completed callback.
 *
 * Narrowing the policy in the type is what lets `reserve` promise such an ingress a reservation:
 * the only path that yields `null` is the skip policy, so a rejecting caller needs no null branch
 * and cannot grow an unreachable one.
 */
export interface RejectingInboundCallbackIngress extends InboundCallbackIngress {
  onCompleted: 'reject';
}

export interface InboundCallbackReservation {
  key: string;
  ownerValue: string;
  ingress: InboundCallbackIngress;
}

/**
 * At-most-once consumption of an inbound provider callback.
 *
 * Providers deliver at least once: a callback whose response is lost is sent again, and a slow
 * handler can be racing its own redelivery. The lifecycle is reserve a short processing lease keyed
 * by the provider's delivery id, mark it completed with a long TTL on success, release it on
 * failure so a retry can proceed, and fail closed whenever the store cannot answer — admitting a
 * delivery it could not check would defeat the guarantee.
 *
 * Callers keep their own delivery-id validation at the controller edge, where the provider payload
 * is parsed and the right problem response is known.
 */
@Injectable()
export class InboundCallbackReplayGuard {
  private readonly logger = new Logger(InboundCallbackReplayGuard.name);

  constructor(
    @InjectRedis() private readonly redis: RedisClientLike,
    @Optional() redisConfig?: RedisConfigService,
  ) {
    // The in-memory fallback client is per-process, so on more than one replica it guarantees
    // nothing. Refusing to start is the only honest answer for an ingress that claims at-most-once.
    if (process.env['NODE_ENV'] === 'production' && !redisConfig?.connectionConfig) {
      throw new Error('Inbound callback replay protection requires Redis in production.');
    }
  }

  /**
   * A lease on one delivery, or `null` when the ingress skips redeliveries of a completed one.
   *
   * @throws UnauthorizedException when the delivery is a replay this ingress refuses.
   * @throws ServiceUnavailableException when the replay store cannot answer.
   */
  async reserve(ingress: RejectingInboundCallbackIngress, deliveryId: string): Promise<InboundCallbackReservation>;
  async reserve(ingress: InboundCallbackIngress, deliveryId: string): Promise<InboundCallbackReservation | null>;
  async reserve(ingress: InboundCallbackIngress, deliveryId: string): Promise<InboundCallbackReservation | null> {
    const reservation: InboundCallbackReservation = {
      key: inboundCallbackKey(ingress.namespace, deliveryId),
      ownerValue: `processing:${randomUUID()}`,
      ingress,
    };

    for (let attempt = 0; attempt < 2; attempt += 1) {
      // A release can race the failed NX reservation, so retry once when the key disappears.
      // eslint-disable-next-line no-await-in-loop
      const acquired = await this.operation(
        ingress,
        this.redis.set(reservation.key, reservation.ownerValue, 'PX', ingress.processingTtlMs, 'NX'),
      );
      if (acquired === 'OK') {
        return reservation;
      }

      // eslint-disable-next-line no-await-in-loop
      const existing = await this.operation(ingress, this.redis.get(reservation.key));
      if (existing === completedValue && ingress.onCompleted === 'skip') {
        return null;
      }
      if (existing !== null) {
        throw new UnauthorizedException(ingress.codes.replayed);
      }
    }

    throw new ServiceUnavailableException(ingress.codes.unavailable);
  }

  /** Mark the delivery consumed, which is what makes a later redelivery recognisable. */
  async complete(reservation: InboundCallbackReservation): Promise<void> {
    const redis = this.redis as Partial<RedisOwnedValueClient>;
    if (!redis.replaceIfValue) {
      throw new ServiceUnavailableException(reservation.ingress.codes.unavailable);
    }

    const completed = await this.operation(
      reservation.ingress,
      redis.replaceIfValue(reservation.key, reservation.ownerValue, completedValue, reservation.ingress.completedTtlMs),
    );
    if (!completed) {
      throw new ServiceUnavailableException(reservation.ingress.codes.reservationLost);
    }
  }

  /** Hand the delivery back so the provider's retry is not rejected as a replay of a failure. */
  async release(reservation: InboundCallbackReservation): Promise<void> {
    try {
      await withTimeout(this.redis.deleteIfValue(reservation.key, reservation.ownerValue), redisOperationTimeoutMs);
    } catch {
      this.logger.warn('Inbound callback replay reservation cleanup failed; the processing lease will expire.');
    }
  }

  private async operation<Result>(ingress: InboundCallbackIngress, operation: Promise<Result>): Promise<Result> {
    try {
      return await withTimeout(operation, redisOperationTimeoutMs);
    } catch (error) {
      throw new ServiceUnavailableException(ingress.codes.unavailable, { cause: error });
    }
  }
}

/**
 * The key one delivery occupies.
 *
 * Every segment is escaped, because `:` is the field delimiter: a delivery id carrying one would
 * shift the key boundaries and let one ingress's delivery address another's reservation. Case is
 * preserved — folding it would collapse two distinct delivery ids onto one key and report the
 * second as a replay.
 */
export function inboundCallbackKey(namespace: readonly string[], deliveryId: string): string {
  const escaped = escapeKeyPart(deliveryId);
  if (escaped.length === 0) {
    throw new Error('An inbound callback delivery id must not be empty.');
  }

  return [...namespace.map(escapeKeyPart), escaped].join(':');
}

function escapeKeyPart(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9._-]/gu, '_');
}

async function withTimeout<Result>(operation: Promise<Result>, timeoutMs: number): Promise<Result> {
  let timeout!: NodeJS.Timeout;
  try {
    return await Promise.race([
      operation,
      new Promise<Result>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new Error('Inbound callback replay storage operation timed out.'));
        }, timeoutMs);
        timeout.unref();
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}
