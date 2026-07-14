export class PostgresMigrationStatusUnsupportedError extends Error {
  constructor() {
    super('Postgres migration status check is not supported.');
    this.name = 'PostgresMigrationStatusUnsupportedError';
  }
}
