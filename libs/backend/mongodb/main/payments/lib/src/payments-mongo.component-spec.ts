// @requirements REQ-PAYMENT-ORDER-001 REQ-PAYMENT-ORDER-003 REQ-PAYMENT-PROVIDER-005 REQ-PAYMENT-WEBHOOK-002 REQ-SCAFFOLD-SAFETY-008
import { randomUUID } from 'node:crypto';
import type { StartedMongoDBContainer } from '@testcontainers/mongodb';
import { MongoClient, type Db, type Document } from 'mongodb';
import { afterAll, describe, expect, it } from 'vitest';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { runMongoMigrations, verifyAppliedMongoMigrations } from '../../../shared/lib/src/migrations/mongo-migration';
import {
  PaymentEventsCollectionName,
  PaymentProviderHealthCollectionName,
  PaymentProvidersCollectionName,
  PaymentRefundsCollectionName,
  PaymentsCollectionName,
  PaymentWebhookReceiptsCollectionName,
  PaymentWebhookReplayIndexName,
} from './payments-mongo.collection';
import {
  PaymentsMongoPersistence,
  type PaymentsMongoOrderedWriteObserver,
  type PaymentsMongoOrderedWriteStage,
} from './payments-mongo.repository';
import { paymentsMongoMigrations } from './migrations';

/* eslint-disable no-await-in-loop -- crash stages must run sequentially against one live database */

type StringIdDocument = Document & { _id: string };

interface MongoHarness {
  readonly database: Db;
  readonly client: MongoClient;
  readonly container?: StartedMongoDBContainer;
  readonly source: string;
}

let harnessPromise: Promise<MongoHarness> | undefined;

async function createHarness(): Promise<MongoHarness> {
  const { MongoDBContainer } = await import('@testcontainers/mongodb');
  const container = await new MongoDBContainer('mongo:8.0.32-noble').start();
  const client = new MongoClient(container.getConnectionString(), {
    directConnection: true,
    replicaSet: 'rs0',
    serverSelectionTimeoutMS: 10_000,
  });
  try {
    await client.connect();
    return {
      database: client.db(`payments_component_${randomUUID().replaceAll('-', '')}`),
      client,
      container,
      source: 'Testcontainers MongoDB',
    };
  } catch (error) {
    await client.close().catch(() => undefined);
    await container.stop();
    throw error;
  }
}

function harness(): Promise<MongoHarness> {
  harnessPromise ??= createHarness();
  return harnessPromise;
}

function liveMongoTest(name: string, run: (active: MongoHarness) => Promise<void>): void {
  it(name, async () => {
    const active = await harness();
    expect(active.source).toMatch(/MongoDB/u);
    await run(active);
  });
}

async function createPayment(repository: PaymentsMongoPersistence, id: string): Promise<void> {
  await repository.createPaymentRecord({
    id,
    tenantId: randomUUID(),
    providerCode: 'stripe',
    amount: '10.00',
    currency: 'USD',
  });
}

function transitionInput(idempotencyKey: string, paymentId: string) {
  return {
    receipt: {
      providerCode: 'stripe',
      idempotencyKey,
      rawBody: '{}',
      signatureValid: 'valid' as const,
    },
    paymentId,
    toStatus: 'paid' as const,
    actor: 'webhook',
  };
}

class CrashAfterStageObserver implements PaymentsMongoOrderedWriteObserver {
  constructor(private readonly stage: PaymentsMongoOrderedWriteStage) {}

  after(stage: PaymentsMongoOrderedWriteStage): void {
    if (stage === this.stage) {
      throw new Error(`injected crash after ${stage}`);
    }
  }
}

afterAll(async () => {
  const active = await harnessPromise?.catch(() => undefined);
  if (!active) {
    return;
  }
  try {
    await active.database.dropDatabase();
  } finally {
    try {
      await active.client.close();
    } finally {
      await active.container?.stop();
    }
  }
});

describe('MongoDB payments persistence', () => {
  it('starts an owned MongoDB container without using ambient endpoints', async () => {
    const active = await harness();
    expect(active.source).toBe('Testcontainers MongoDB');
    expect(active.container).toBeDefined();
  });

  liveMongoTest('applies, re-verifies, and drift-checks the numbered migration', async (active) => {
    await expect(runMongoMigrations(active.database, paymentsMongoMigrations)).resolves.toEqual({
      applied: ['20260823100000_initialize_payments', '20260827100000_add_payment_webhook_claim_lease'],
      skipped: [],
    });
    await expect(runMongoMigrations(active.database, paymentsMongoMigrations)).resolves.toEqual({
      applied: [],
      skipped: ['20260823100000_initialize_payments', '20260827100000_add_payment_webhook_claim_lease'],
    });
    await expect(verifyAppliedMongoMigrations(active.database, paymentsMongoMigrations)).resolves.toBeUndefined();

    const names = (await active.database.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name);
    expect(names).toEqual(
      expect.arrayContaining([
        PaymentsCollectionName,
        PaymentEventsCollectionName,
        PaymentWebhookReceiptsCollectionName,
        PaymentProvidersCollectionName,
        PaymentRefundsCollectionName,
        PaymentProviderHealthCollectionName,
      ]),
    );
    const receiptIndexes = await active.database
      .collection<StringIdDocument>(PaymentWebhookReceiptsCollectionName)
      .indexes();
    expect(receiptIndexes).toContainEqual(
      expect.objectContaining({ name: PaymentWebhookReplayIndexName, unique: true }),
    );
  });

  liveMongoTest(
    'claims one concurrent winner and renews a stale lease without rewriting receipt time',
    async (active) => {
      await runMongoMigrations(active.database, paymentsMongoMigrations);
      const first = new PaymentsMongoPersistence(active.database);
      const second = new PaymentsMongoPersistence(active.database);
      const receivedAt = new Date('2026-08-27T09:00:00.000Z');
      const input = {
        providerCode: 'stripe',
        idempotencyKey: `claim-${randomUUID()}`,
        rawBody: '{}',
        signatureValid: 'valid' as const,
        receivedAt,
      };

      const [left, right] = await Promise.all([
        first.claimWebhookReceipt(input, new Date(receivedAt.getTime() - 5_000)),
        second.claimWebhookReceipt(input, new Date(receivedAt.getTime() - 5_000)),
      ]);
      expect([left.kind, right.kind].sort((firstKind, secondKind) => firstKind.localeCompare(secondKind))).toEqual([
        'claimed',
        'inflight',
      ]);

      const original = left.kind === 'claimed' ? left.receipt : right.receipt;
      await active.database
        .collection<StringIdDocument>(PaymentWebhookReceiptsCollectionName)
        .updateOne({ _id: original.id }, { $set: { processingStatus: 'error', statusCode: 502 } });
      const recoveredAt = new Date(receivedAt.getTime() + 60_000);
      await expect(
        first.claimWebhookReceipt({ ...input, claimedAt: recoveredAt }, new Date(recoveredAt.getTime() - 5_000)),
      ).resolves.toMatchObject({
        kind: 'resumable',
        receipt: { receivedAt, claimedAt: recoveredAt, processingStatus: 'pending' },
      });
      await expect(
        second.claimWebhookReceipt({ ...input, claimedAt: recoveredAt }, new Date(recoveredAt.getTime() - 5_000)),
      ).resolves.toMatchObject({ kind: 'inflight' });
    },
  );

  liveMongoTest('enforces validators and the receipt replay wall in the live database', async (active) => {
    await runMongoMigrations(active.database, paymentsMongoMigrations);

    await expect(
      active.database
        .collection<StringIdDocument>(PaymentsCollectionName)
        .insertOne({ _id: 'invalid', status: 'unknown', amount: '-1' }),
    ).rejects.toMatchObject({ code: 121 });

    const receipt = {
      _id: randomUUID(),
      providerCode: 'stripe',
      idempotencyKey: 'evt_replay_wall',
      rawBody: '{}',
      contentType: null,
      signatureValid: 'valid',
      signatureKind: null,
      statusCode: null,
      processingStatus: 'pending',
      error: null,
      requestId: null,
      receivedAt: new Date(),
      claimedAt: new Date(),
      processedAt: null,
    };
    await active.database.collection<StringIdDocument>(PaymentWebhookReceiptsCollectionName).insertOne(receipt);
    await expect(
      active.database
        .collection<StringIdDocument>(PaymentWebhookReceiptsCollectionName)
        .insertOne({ ...receipt, _id: randomUUID() }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  liveMongoTest(
    'rejects illegal or cross-provider transitions and persists same-status partial amounts',
    async (active) => {
      await runMongoMigrations(active.database, paymentsMongoMigrations);
      const repository = new PaymentsMongoPersistence(active.database);
      for (const [status, providerCode] of [
        ['failed', 'stripe'],
        ['processing', 'yookassa'],
      ] as const) {
        const paymentId = randomUUID();
        await repository.createPaymentRecord({
          id: paymentId,
          tenantId: randomUUID(),
          providerCode,
          status,
          amount: '10.00',
          currency: 'USD',
        });
        await expect(
          repository.commitWebhookPaymentTransition(transitionInput(randomUUID(), paymentId)),
        ).rejects.toThrow('ownership or state');
        expect(await repository.findPaymentRecord(paymentId)).toMatchObject({ status, version: 1 });
        expect(
          (await repository.listPaymentEvents(paymentId)).filter((event) => event.type === 'state_change'),
        ).toHaveLength(0);
      }
      const paymentId = randomUUID();
      await repository.createPaymentRecord({
        id: paymentId,
        tenantId: randomUUID(),
        providerCode: 'stripe',
        status: 'processing',
        amount: '10.00',
        currency: 'USD',
      });
      await repository.commitWebhookPaymentTransition({
        ...transitionInput(randomUUID(), paymentId),
        toStatus: 'processing',
        partialAmount: '4.00',
      });
      expect(await repository.findPaymentRecord(paymentId)).toMatchObject({
        status: 'processing',
        partialAmount: '4.00',
        version: 2,
      });
    },
  );

  liveMongoTest('recovers every ordered-write crash prefix by replay', async (active) => {
    await runMongoMigrations(active.database, paymentsMongoMigrations);

    for (const stage of ['receipt', 'event', 'payment'] as const) {
      const paymentId = randomUUID();
      const idempotencyKey = `evt_crash_${stage}_${randomUUID()}`;
      const repository = new PaymentsMongoPersistence(active.database);
      await createPayment(repository, paymentId);

      const crashingRepository = new PaymentsMongoPersistence(active.database, new CrashAfterStageObserver(stage));
      await expect(
        crashingRepository.commitWebhookPaymentTransition(transitionInput(idempotencyKey, paymentId)),
      ).rejects.toThrow(`injected crash after ${stage}`);

      const pendingReceipt = await active.database
        .collection<StringIdDocument>(PaymentWebhookReceiptsCollectionName)
        .findOne({ providerCode: 'stripe', idempotencyKey });
      const event = await active.database
        .collection<StringIdDocument>(PaymentEventsCollectionName)
        .findOne({ _id: `${pendingReceipt?._id}:state_change` });
      const payment = await active.database
        .collection<StringIdDocument>(PaymentsCollectionName)
        .findOne({ _id: paymentId });
      expect(pendingReceipt).toMatchObject({ processingStatus: 'pending' });
      expect(Boolean(event)).toBe(stage !== 'receipt');
      expect(payment).toMatchObject({ status: stage === 'payment' ? 'paid' : 'pending' });

      await expect(
        repository.commitWebhookPaymentTransition(transitionInput(idempotencyKey, paymentId)),
      ).resolves.toMatchObject({
        receipt: { id: pendingReceipt?._id, processingStatus: 'applied' },
        payment: { id: paymentId, status: 'paid', version: 2 },
        event: { paymentId, toStatus: 'paid' },
      });
      await expect(
        repository.commitWebhookPaymentTransition(transitionInput(idempotencyKey, paymentId)),
      ).resolves.toMatchObject({
        payment: { status: 'paid', version: 2 },
      });
    }
  });
});
