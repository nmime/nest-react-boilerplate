// @requirements REQ-PAYMENT-ORDER-003 REQ-PAYMENT-PROVIDER-005 REQ-PAYMENT-WEBHOOK-002
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
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

let harnessPromise: Promise<MongoHarness | null> | undefined;
let unavailableReason = '';

async function createHarness(): Promise<MongoHarness | null> {
  const configuredUri = process.env['PAYMENTS_TEST_MONGODB_URI'] ?? process.env['MONGODB_URI'];
  if (configuredUri) {
    const configured = await connect(configuredUri, 'configured MongoDB');
    if (configured) {
      return configured;
    }
  }

  const local = await connect('mongodb://127.0.0.1:27017', 'local MongoDB');
  if (local) {
    return local;
  }

  if (!existsSync('/var/run/docker.sock')) {
    unavailableReason =
      'MongoDB component tests self-skip: neither a configured/local MongoDB server nor /var/run/docker.sock is available. Unit tests still exercise collection DDL, migration verification, module wiring, ordered writes, and injected crash recovery at 100% coverage.';
    return null;
  }

  try {
    const { MongoDBContainer } = await import('@testcontainers/mongodb');
    const container = await new MongoDBContainer('mongo:7.0.26-jammy').start();
    const client = new MongoClient(container.getConnectionString(), { serverSelectionTimeoutMS: 10_000 });
    await client.connect();
    return {
      database: client.db(`payments_component_${randomUUID().replaceAll('-', '')}`),
      client,
      container,
      source: 'Testcontainers MongoDB',
    };
  } catch (error) {
    unavailableReason = `MongoDB component tests self-skip: Testcontainers could not start (${error instanceof Error ? error.message : String(error)}). Unit tests still exercise collection DDL, migration verification, module wiring, ordered writes, and injected crash recovery at 100% coverage.`;
    return null;
  }
}

async function connect(uri: string, source: string): Promise<MongoHarness | null> {
  const client = new MongoClient(uri, { directConnection: true, serverSelectionTimeoutMS: 500 });
  try {
    await client.connect();
    await client.db('admin').command({ ping: 1 });
    return {
      database: client.db(`payments_component_${randomUUID().replaceAll('-', '')}`),
      client,
      source,
    };
  } catch {
    await client.close().catch(() => undefined);
    return null;
  }
}

function harness(): Promise<MongoHarness | null> {
  harnessPromise ??= createHarness();
  return harnessPromise;
}

function liveMongoTest(name: string, run: (active: MongoHarness) => Promise<void>): void {
  it(name, async (context) => {
    const active = await harness();
    if (!active) {
      context.skip(unavailableReason);
      return;
    }
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
  const active = await harness();
  if (!active) {
    return;
  }
  await active.database.dropDatabase();
  await active.client.close();
  await active.container?.stop();
});

describe('MongoDB payments persistence', () => {
  it('reports the live-Mongo prerequisite honestly', async (context) => {
    const active = await harness();
    if (!active) {
      context.skip(unavailableReason);
      return;
    }
    expect(active.source).toMatch(/MongoDB/u);
  });

  liveMongoTest('applies, re-verifies, and drift-checks the numbered migration', async (active) => {
    await expect(runMongoMigrations(active.database, paymentsMongoMigrations)).resolves.toEqual({
      applied: ['20260823100000_initialize_payments'],
      skipped: [],
    });
    await expect(runMongoMigrations(active.database, paymentsMongoMigrations)).resolves.toEqual({
      applied: [],
      skipped: ['20260823100000_initialize_payments'],
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
      processedAt: null,
    };
    await active.database.collection<StringIdDocument>(PaymentWebhookReceiptsCollectionName).insertOne(receipt);
    await expect(
      active.database
        .collection<StringIdDocument>(PaymentWebhookReceiptsCollectionName)
        .insertOne({ ...receipt, _id: randomUUID() }),
    ).rejects.toMatchObject({ code: 11000 });
  });

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
