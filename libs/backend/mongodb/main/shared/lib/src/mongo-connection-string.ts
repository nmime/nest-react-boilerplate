// Load this package's CJS export through createRequire; its generated ESM wrapper is unreliable here.
import { createRequire } from 'node:module';
import type MongoConnectionStringType from 'mongodb-connection-string-url';

const loadModule = createRequire(__filename);
const MongoConnectionString = loadModule('mongodb-connection-string-url') as {
  default: typeof MongoConnectionStringType;
};
const MongoConnectionStringConstructor = MongoConnectionString.default;

export { MongoConnectionStringConstructor as MongoConnectionString };
