import {
  isProviderHttpError,
  ProviderHttpError,
  type ProviderHttpErrorClass,
} from '@app/backend-feature-payments-shared';
import { ProviderHealthService } from '../service/provider-health.service';

export interface ProviderRetryPolicy {
  /** Total attempts, including the first call. */
  readonly maxAttempts?: number;
  readonly backoffMs?: number;
  readonly maxBackoffMs?: number;
}

export interface ProviderTokenBucketPolicy {
  readonly capacity: number;
  readonly refillTokens: number;
  readonly refillIntervalMs: number;
}

export interface ProviderHttpPolicy {
  readonly timeoutMs: number;
  readonly retry?: ProviderRetryPolicy;
  readonly tokenBucket?: ProviderTokenBucketPolicy;
  readonly maxConcurrency?: number;
}

export interface ProviderHttpRequest {
  readonly providerCode: string;
  readonly url: string;
  readonly init?: RequestInit;
  readonly policy: ProviderHttpPolicy;
}

export interface ProviderHttpDependencies {
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

interface BucketState {
  tokens: number;
  updatedAt: number;
}

class Semaphore {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async acquire(): Promise<() => void> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.active += 1;
    return () => {
      this.active -= 1;
      this.waiting.shift()?.();
    };
  }
}

function retryAfterSeconds(response: Response): number | undefined {
  const value = response.headers.get('retry-after');
  if (value === null) {
    return undefined;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.ceil(seconds);
  }
  const date = Date.parse(value);
  if (Number.isNaN(date)) {
    return undefined;
  }
  return Math.max(1, Math.ceil((date - Date.now()) / 1_000));
}

function errorClassForStatus(status: number): ProviderHttpErrorClass {
  if (status === 401 || status === 403) {
    return 'auth';
  }
  if (status === 429) {
    return 'rate_limited';
  }
  if (status >= 400 && status < 500) {
    return 'client';
  }
  return 'server';
}

function shouldRetry(error: ProviderHttpError, attempt: number, maxAttempts: number): boolean {
  return error.retryable && attempt < maxAttempts;
}

function backoffFor(error: ProviderHttpError, attempt: number, policy: Required<ProviderRetryPolicy>): number {
  const exponential = Math.min(policy.backoffMs * 2 ** Math.max(0, attempt - 1), policy.maxBackoffMs);
  return Math.max(exponential, (error.retryAfterSeconds ?? 0) * 1_000);
}

/** Shared fetch boundary with bounded retries, rate protection, and health evidence. */
export class ProviderHttpClient {
  private readonly buckets = new Map<string, BucketState>();
  private readonly semaphores = new Map<string, Semaphore>();
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(
    private readonly health: ProviderHealthService,
    dependencies: ProviderHttpDependencies = {},
  ) {
    this.fetchImpl = dependencies.fetch ?? fetch;
    this.now = dependencies.now ?? Date.now;
    this.sleep = dependencies.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  async request(input: ProviderHttpRequest): Promise<Response> {
    const retryPolicy: Required<ProviderRetryPolicy> = {
      maxAttempts: input.policy.retry?.maxAttempts ?? 3,
      backoffMs: input.policy.retry?.backoffMs ?? 250,
      maxBackoffMs: input.policy.retry?.maxBackoffMs ?? 5_000,
    };
    if (retryPolicy.maxAttempts < 1) {
      throw new RangeError('Provider retry maxAttempts must be at least one.');
    }

    // Retries are intentionally sequential: each attempt consumes the shared bucket,
    // semaphore, health evidence, and backoff state before the next one may start.
    /* eslint-disable no-await-in-loop */
    for (let attempt = 1; ; attempt += 1) {
      await this.takeToken(input.providerCode, input.policy.tokenBucket);
      const release = await this.semaphore(input.providerCode, input.policy.maxConcurrency).acquire();
      try {
        const response = await this.fetchAttempt(input);
        if (response.ok) {
          await this.health.recordSuccess(input.providerCode);
          return response;
        }
        const errorClass = errorClassForStatus(response.status);
        throw new ProviderHttpError(errorClass, `Provider HTTP ${response.status}`, {
          providerStatus: response.status,
          retryable: errorClass === 'rate_limited' || errorClass === 'server',
          retryAfterSeconds: retryAfterSeconds(response),
        });
      } catch (cause) {
        const error = this.normalizeError(cause);
        await this.health.recordError(input.providerCode, error.class);
        if (!shouldRetry(error, attempt, retryPolicy.maxAttempts)) {
          throw error;
        }
        await this.sleep(backoffFor(error, attempt, retryPolicy));
      } finally {
        release();
      }
    }
    /* eslint-enable no-await-in-loop */
  }

  private async fetchAttempt(input: ProviderHttpRequest): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, input.policy.timeoutMs);
    const externalSignal = input.init?.signal;
    const abort = () => {
      controller.abort();
    };
    externalSignal?.addEventListener('abort', abort, { once: true });
    try {
      return await this.fetchImpl(input.url, { ...input.init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
      externalSignal?.removeEventListener('abort', abort);
    }
  }

  private normalizeError(cause: unknown): ProviderHttpError {
    if (isProviderHttpError(cause)) {
      return cause;
    }
    if (cause instanceof Error && cause.name === 'AbortError') {
      return new ProviderHttpError('timeout', 'Provider request timed out', { retryable: true });
    }
    return new ProviderHttpError('network', 'Provider request failed at the network boundary', {
      retryable: true,
    });
  }

  private semaphore(providerCode: string, maxConcurrency = Number.MAX_SAFE_INTEGER): Semaphore {
    const key = `${providerCode}:${maxConcurrency}`;
    const existing = this.semaphores.get(key);
    if (existing !== undefined) {
      return existing;
    }
    if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
      throw new RangeError('Provider maxConcurrency must be a positive integer.');
    }
    const created = new Semaphore(maxConcurrency);
    this.semaphores.set(key, created);
    return created;
  }

  private async takeToken(providerCode: string, policy: ProviderTokenBucketPolicy | undefined): Promise<void> {
    if (policy === undefined) {
      return;
    }
    if (
      !Number.isFinite(policy.capacity) ||
      policy.capacity <= 0 ||
      !Number.isFinite(policy.refillTokens) ||
      policy.refillTokens <= 0 ||
      !Number.isFinite(policy.refillIntervalMs) ||
      policy.refillIntervalMs <= 0
    ) {
      throw new RangeError('Provider token bucket values must be positive.');
    }

    const now = this.now();
    const previous = this.buckets.get(providerCode) ?? { tokens: policy.capacity, updatedAt: now };
    const refill = ((now - previous.updatedAt) / policy.refillIntervalMs) * policy.refillTokens;
    const state = {
      tokens: Math.min(policy.capacity, previous.tokens + Math.max(0, refill)),
      updatedAt: now,
    };
    if (state.tokens < 1) {
      const waitMs = Math.ceil(((1 - state.tokens) / policy.refillTokens) * policy.refillIntervalMs);
      await this.sleep(waitMs);
      const afterWait = this.now();
      state.tokens = Math.min(
        policy.capacity,
        state.tokens + ((afterWait - state.updatedAt) / policy.refillIntervalMs) * policy.refillTokens,
      );
      state.updatedAt = afterWait;
    }
    if (state.tokens < 1) {
      throw new ProviderHttpError('rate_limited', 'Local provider token bucket is exhausted', {
        retryable: true,
        retryAfterSeconds: Math.max(1, Math.ceil(policy.refillIntervalMs / 1_000)),
      });
    }
    state.tokens -= 1;
    this.buckets.set(providerCode, state);
  }
}
