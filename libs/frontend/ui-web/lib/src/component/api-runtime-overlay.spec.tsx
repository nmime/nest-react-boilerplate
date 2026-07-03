import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UiApiRuntimeOverlay } from "./api-runtime-overlay";

describe("UiApiRuntimeOverlay", () => {
  it("contains runtime notification content in named landmarks and live regions", () => {
    const html = renderToStaticMarkup(
      <UiApiRuntimeOverlay
        status="online"
        toasts={[
          {
            category: "info",
            id: "api-sync",
            message: "Route data refreshed",
            title: "API sync",
          },
        ]}
      />,
    );

    expect(html).toContain("<aside");
    expect(html).toContain('aria-label="API runtime status"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-label="API notifications"');
    expect(html).toContain("API sync: Route data refreshed");
  });
});
