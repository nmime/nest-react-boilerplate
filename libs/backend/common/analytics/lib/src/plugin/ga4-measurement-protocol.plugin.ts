import type { AnalyticsPlugin } from "../type";
import {
  Ga4MeasurementProtocolProvider,
  type Ga4MeasurementProtocolPluginOptions,
} from "./providers";

export type { Ga4MeasurementProtocolPluginOptions };

export function createGa4MeasurementProtocolPlugin(
  options: Ga4MeasurementProtocolPluginOptions,
): AnalyticsPlugin {
  return new Ga4MeasurementProtocolProvider(options);
}
