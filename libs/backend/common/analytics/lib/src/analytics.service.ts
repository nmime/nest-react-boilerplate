import { Injectable, Logger } from "@nestjs/common";
import { AnalyticsConfigService } from "./config";
import type {
  AnalyticsIdentifyPayload,
  AnalyticsPagePayload,
  AnalyticsPayload,
  AnalyticsPlugin,
} from "./type";

/* v8 ignore start -- the @Injectable() decorator transpiles to a decorator-helper call whose empty-slot branch is unreachable from tests; only this class trips it because its overloaded dispatch() shifts esbuild's emit */
@Injectable()
/* v8 ignore stop */
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly configService: AnalyticsConfigService) {}

  get environment(): string {
    return this.configService.environment;
  }

  async identify<
    TTraits extends Record<string, unknown> = Record<string, unknown>,
  >(
    userId: string,
    traits?: TTraits,
    context?: Record<string, unknown>,
  ): Promise<void> {
    await this.dispatch("identify", {
      userId,
      traits,
      context,
      timestamp: new Date(),
    });
  }

  track<TProperties extends Record<string, unknown> = Record<string, unknown>>(
    event: string,
    properties?: TProperties,
    options: Omit<AnalyticsPayload<TProperties>, "event" | "properties"> = {},
  ): void {
    // track() is fire-and-forget: dispatch can reject synchronously when config
    // getters throw on malformed env, so guard the rejection to avoid crashing
    // the process with an unhandled rejection.
    this.dispatch("track", {
      ...options,
      event,
      properties,
      timestamp: options.timestamp ?? new Date(),
    }).catch((error: unknown) => {
      this.logger.error(`Analytics track for "${event}" failed`, error);
    });
  }

  async page<
    TProperties extends Record<string, unknown> = Record<string, unknown>,
  >(payload: AnalyticsPagePayload<TProperties> = {}): Promise<void> {
    await this.dispatch("page", {
      ...payload,
      timestamp: payload.timestamp ?? new Date(),
    });
  }

  private async dispatch(
    method: "track",
    payload: AnalyticsPayload,
  ): Promise<void>;
  private async dispatch(
    method: "identify",
    payload: AnalyticsIdentifyPayload,
  ): Promise<void>;
  private async dispatch(
    method: "page",
    payload: AnalyticsPagePayload,
  ): Promise<void>;
  private async dispatch(
    method: keyof Pick<AnalyticsPlugin, "track" | "identify" | "page">,
    payload: AnalyticsPayload | AnalyticsIdentifyPayload | AnalyticsPagePayload,
  ): Promise<void> {
    if (!this.configService.enabled) {
      return;
    }

    // Plugins are independent network sinks with no ordering guarantees, so fan
    // out in parallel. Each invocation catches its own failure and logs it with
    // the plugin name, so no rejection escapes and every plugin still runs.
    await Promise.all(
      this.configService.plugins.map(async (plugin) => {
        try {
          await plugin[method]?.(payload as never);
        } catch (error) {
          this.logger.error(`Analytics plugin "${plugin.name}" failed`, error);
        }
      }),
    );
  }
}
