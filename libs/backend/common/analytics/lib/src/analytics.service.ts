import { Injectable, Logger } from "@nestjs/common";
import { AnalyticsConfigService } from "./config";
import type {
  AnalyticsIdentifyPayload,
  AnalyticsPagePayload,
  AnalyticsPayload,
  AnalyticsPlugin,
} from "./type";

@Injectable()
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
    void this.dispatch("track", {
      ...options,
      event,
      properties,
      timestamp: options.timestamp ?? new Date(),
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

    for (const plugin of this.configService.plugins) {
      try {
        await plugin[method]?.(payload as never);
      } catch (error) {
        this.logger.error(`Analytics plugin "${plugin.name}" failed`, error);
      }
    }
  }
}
