import { describe, expect, it } from 'vitest';
import * as frontendUi from './index';

describe('@app/frontend-ui compatibility facade', () => {
  it('re-exports the canonical runtime and web UI surfaces', () => {
    expect(frontendUi.FrontendI18nProvider).toBeDefined();
    expect(frontendUi.FrontendQueryProvider).toBeDefined();
    expect(frontendUi.UiButton).toBeDefined();
    expect(frontendUi.ProductShell).toBeDefined();
  });
});
