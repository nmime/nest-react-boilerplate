import { Logger } from "@nestjs/common";
import type { AnalyticsPlugin } from "../type";
import { LoggerAnalyticsProvider } from "./providers";

export function createLoggerAnalyticsPlugin(
  logger = new Logger("Analytics"),
): AnalyticsPlugin {
  return new LoggerAnalyticsProvider(logger);
}
