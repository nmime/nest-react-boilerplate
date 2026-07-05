export class PostgresDependencyNotConfiguredError extends Error {
  constructor() {
    super("Postgres dependency is not configured.");
    this.name = "PostgresDependencyNotConfiguredError";
  }
}
