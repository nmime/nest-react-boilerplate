import { AbstractAnalyticsProvider } from "../base";

export class NoopAnalyticsProvider extends AbstractAnalyticsProvider {
  constructor(readonly name = "noop") {
    super();
  }

  track(): undefined {
    return undefined;
  }

  identify(): undefined {
    return undefined;
  }

  page(): undefined {
    return undefined;
  }
}
