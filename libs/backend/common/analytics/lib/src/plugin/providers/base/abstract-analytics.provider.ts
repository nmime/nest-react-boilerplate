import type {
  AnalyticsIdentifyPayload,
  AnalyticsPagePayload,
  AnalyticsPayload,
  AnalyticsPlugin,
} from "../../../type";

export abstract class AbstractAnalyticsProvider implements AnalyticsPlugin {
  abstract readonly name: string;

  track?(payload: AnalyticsPayload): Promise<void> | void;
  identify?(payload: AnalyticsIdentifyPayload): Promise<void> | void;
  page?(payload: AnalyticsPagePayload): Promise<void> | void;
}
