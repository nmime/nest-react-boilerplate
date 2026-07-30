export const DefaultMongoConnectTimeoutMs = 10_000;
export const DefaultMongoServerSelectionTimeoutMs = 5_000;
export const DefaultMongoMinPoolSize = 0;
export const DefaultMongoMaxPoolSize = 20;
export const DefaultMongoHealthTimeoutMs = 2_000;
export const DefaultMongoTransactionRetries = 2;
export const DefaultMongoCommitRetries = 2;
export const MaximumMongoTransactionRetries = 10;

export const MongoClientToken = 'MONGODB_CLIENT';
export const MongoDatabaseToken = 'MONGODB_DATABASE';
export const MongoHealthAdapter = 'MONGODB_HEALTH_ADAPTER';
export const MongoHealthOptionsToken = 'MONGODB_HEALTH_OPTIONS';

export const TransientTransactionErrorLabel = 'TransientTransactionError';
export const UnknownTransactionCommitResultLabel = 'UnknownTransactionCommitResult';
