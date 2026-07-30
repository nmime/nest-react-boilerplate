// Bun 1.3.14 misreads this package's generated ESM wrapper; its CJS export is equivalent under Node.
import { createRequire } from 'node:module';
import type MongoConnectionStringType from 'mongodb-connection-string-url';

const loadModule = createRequire(__filename);
const MongoConnectionString = loadModule('mongodb-connection-string-url') as {
  default: typeof MongoConnectionStringType;
};
const MongoConnectionStringConstructor = MongoConnectionString.default;

export { MongoConnectionStringConstructor as MongoConnectionString };
