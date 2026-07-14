export class NatsConnectionUnavailableError extends Error {
  constructor(reason: string) {
    super(`NATS connection is unavailable: ${reason}.`);
    this.name = 'NatsConnectionUnavailableError';
  }
}
