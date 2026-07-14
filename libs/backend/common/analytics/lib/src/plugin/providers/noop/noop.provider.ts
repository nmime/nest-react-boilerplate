import { AbstractAnalyticsProvider } from '../base';

export class NoopAnalyticsProvider extends AbstractAnalyticsProvider {
  constructor(readonly name = 'noop') {
    super();
  }

  override track(): undefined {
    return undefined;
  }

  override identify(): undefined {
    return undefined;
  }

  override page(): undefined {
    return undefined;
  }
}
