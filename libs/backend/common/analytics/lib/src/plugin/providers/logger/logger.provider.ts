import { Logger } from "@nestjs/common";
import { AnalyticsEventType } from "../../../enum";
import type {
  AnalyticsIdentifyPayload,
  AnalyticsPagePayload,
  AnalyticsPayload,
} from "../../../type";
import { AbstractAnalyticsProvider } from "../base";

export class LoggerAnalyticsProvider extends AbstractAnalyticsProvider {
  readonly name = "logger";

  constructor(private readonly logger = new Logger("Analytics")) {
    super();
  }

  override track(payload: AnalyticsPayload): void {
    this.logger.debug(
      JSON.stringify({ type: AnalyticsEventType.Track, payload }),
    );
  }

  override identify(payload: AnalyticsIdentifyPayload): void {
    this.logger.debug(
      JSON.stringify({ type: AnalyticsEventType.Identify, payload }),
    );
  }

  override page(payload: AnalyticsPagePayload): void {
    this.logger.debug(
      JSON.stringify({ type: AnalyticsEventType.Page, payload }),
    );
  }
}
