export interface CommonLogger {
  log(message: string, context?: unknown): void;
  warn(message: string, context?: unknown): void;
  error(message: string, context?: unknown): void;
  debug?(message: string, context?: unknown): void;
  verbose?(message: string, context?: unknown): void;
}
