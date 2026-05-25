import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UiCard } from "../component/card";
import { ProductShell } from "./product-shell";

describe("ProductShell", () => {
  it("renders landmark, heading, status, actions, and children", () => {
    const html = renderToStaticMarkup(
      <ProductShell
        actions={[
          { href: "#primary", label: "Primary action" },
          { href: "/status", label: "Status", variant: "secondary" },
        ]}
        appName="xRocket Test"
        description="Shared shell description"
        eyebrow="Shared shell"
        status="Ready"
        statusTone="success"
        title="Unified product surface"
      >
        <UiCard title="Child card">Reusable content</UiCard>
      </ProductShell>,
    );

    expect(html).toContain("<main");
    expect(html).toContain('aria-label="xRocket Test home"');
    expect(html).toContain("<h1>Unified product surface</h1>");
    expect(html).toContain("Shared shell description");
    expect(html).toContain("xr-status--success");
    expect(html).toContain('href="#primary"');
    expect(html).toContain('href="/status"');
    expect(html).toContain("Reusable content");
  });
});
