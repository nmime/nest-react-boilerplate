import type { Document, MongoClient } from 'mongodb';

const MinimumReplicaSetTransactionWireVersion = 7;

export type MongoTransactionTopologyKind = 'replica_set';

export type MongoTransactionTopologyErrorCode =
  | 'logical_sessions_unavailable'
  | 'primary_unavailable'
  | 'replica_set_mismatch'
  | 'sharded_not_allowed'
  | 'standalone_not_allowed'
  | 'wire_version_unsupported';

export interface MongoTransactionTopology {
  kind: MongoTransactionTopologyKind;
  maxWireVersion: number;
  replicaSetName?: string;
}

export class MongoTransactionTopologyError extends Error {
  override readonly name = 'MongoTransactionTopologyError';

  constructor(
    readonly code: MongoTransactionTopologyErrorCode,
    message: string,
  ) {
    super(message);
  }
}

interface MongoHelloResponse extends Document {
  isWritablePrimary?: unknown;
  ismaster?: unknown;
  logicalSessionTimeoutMinutes?: unknown;
  maxWireVersion?: unknown;
  msg?: unknown;
  setName?: unknown;
}

export async function assertMongoTransactionTopology(
  client: Pick<MongoClient, 'db'>,
  expectedReplicaSet?: string,
): Promise<MongoTransactionTopology> {
  const response = (await client.db('admin').command({ hello: 1 })) as MongoHelloResponse;
  return validateMongoTransactionTopology(response, expectedReplicaSet);
}

export function validateMongoTransactionTopology(
  response: MongoHelloResponse,
  expectedReplicaSet?: string,
): MongoTransactionTopology {
  if (response.msg === 'isdbgrid') {
    throw new MongoTransactionTopologyError(
      'sharded_not_allowed',
      'Sharded MongoDB is not supported; the integrated runtime requires a replica set.',
    );
  }

  const maxWireVersion = integerValue(response.maxWireVersion);
  const logicalSessionTimeoutMinutes = numberValue(response.logicalSessionTimeoutMinutes);
  if (logicalSessionTimeoutMinutes === undefined || logicalSessionTimeoutMinutes <= 0) {
    throw new MongoTransactionTopologyError(
      'logical_sessions_unavailable',
      'MongoDB deployment does not advertise logical sessions required for transactions.',
    );
  }

  const replicaSetName = stringValue(response.setName);
  if (replicaSetName === undefined) {
    throw new MongoTransactionTopologyError(
      'standalone_not_allowed',
      'Standalone MongoDB is not allowed for the transaction-capable runtime.',
    );
  }
  if (expectedReplicaSet !== undefined && replicaSetName !== expectedReplicaSet) {
    throw new MongoTransactionTopologyError(
      'replica_set_mismatch',
      'MongoDB deployment replica-set name does not match the configured replica-set name.',
    );
  }
  if (response.isWritablePrimary !== true && response.ismaster !== true) {
    throw new MongoTransactionTopologyError(
      'primary_unavailable',
      'MongoDB replica set does not currently expose a writable primary.',
    );
  }

  assertWireVersion(maxWireVersion, MinimumReplicaSetTransactionWireVersion, 'replica set');
  return { kind: 'replica_set', maxWireVersion, replicaSetName };
}

function assertWireVersion(value: number | undefined, minimum: number, topology: string): asserts value is number {
  if (value === undefined || value < minimum) {
    throw new MongoTransactionTopologyError(
      'wire_version_unsupported',
      `MongoDB ${topology} does not support the required transaction wire version.`,
    );
  }
}

function integerValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}
