import { Logger } from "@nestjs/common";
import { AnalyticsEventType } from "../enum";
import type { AnalyticsPlugin } from "../type";

export function createLoggerAnalyticsPlugin(
  logger = new Logger("Analytics"),
): AnalyticsPlugin {
  return {
    name: "logger",
    track(payload) {
      logger.debug?.(
        JSON.stringify({ type: AnalyticsEventType.Track, payload }),
      );
    },
    identify(payload) {
      logger.debug?.(
        JSON.stringify({ type: AnalyticsEventType.Identify, payload }),
      );
    },
    page(payload) {
      logger.debug?.(
        JSON.stringify({ type: AnalyticsEventType.Page, payload }),
      );
    },
  };
}
