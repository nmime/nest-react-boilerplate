import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UiCard } from "../component/card";
import { FrontendI18nProvider } from "../i18n/i18n-provider";
import { ProductShell } from "./product-shell";

describe("ProductShell", () => {
  it("renders landmark, heading, status, actions, and children", () => {
    const html = renderToStaticMarkup(
      <ProductShell
        actions={[
          { href: "#primary", isCurrent: true, label: "Primary action" },
          { href: "/status", label: "Status", variant: "secondary" },
        ]}
        actionsLabel="Test primary navigation"
        appName="xRocket Test"
        description="Shared shell description"
        eyebrow="Shared shell"
        homeHref="/admin"
        skipLinkLabel="Skip ahead"
        status="Ready"
        statusTone="success"
        title="Unified product surface"
      >
        <UiCard title="Child card">Reusable content</UiCard>
      </ProductShell>,
    );

    expect(html).toContain('href="#xr-content"');
    expect(html).toContain("Skip ahead");
    expect(html).toContain("<main");
    expect(html).toContain('aria-label="xRocket Test home"');
    expect(html).toContain('href="/admin"');
    expect(html).toContain('aria-label="Test primary navigation"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("<h1>Unified product surface</h1>");
    expect(html).toContain("Shared shell description");
    expect(html).toContain("xr-status--success");
    expect(html).toContain('href="#primary"');
    expect(html).toContain('href="/status"');
    expect(html).toContain('id="xr-content"');
    expect(html).toContain("Reusable content");
  });

  it("localizes default skip link and navigation labels", () => {
    const html = renderToStaticMarkup(
      <ProductShell
        actions={[{ href: "#primary", label: "Primary action" }]}
        appName="xRocket Test"
        description="Shared shell description"
        eyebrow="Shared shell"
        status="Ready"
        title="Unified product surface"
      >
        <UiCard title="Child card">Reusable content</UiCard>
      </ProductShell>,
    );

    expect(html).toContain("Skip to content");
    expect(html).toContain('aria-label="xRocket Test navigation"');
  });

  it("uses locale-aware default shell labels", () => {
    const html = renderToStaticMarkup(
      <FrontendI18nProvider initialLocale="ru">
        <ProductShell
          actions={[{ href: "#primary", label: "Primary action" }]}
          appName="xRocket Test"
          description="Shared shell description"
          eyebrow="Shared shell"
          status="Ready"
          title="Unified product surface"
        >
          <UiCard title="Child card">Reusable content</UiCard>
        </ProductShell>
      </FrontendI18nProvider>,
    );

    expect(html).toContain("Перейти к содержимому");
    expect(html).toContain('aria-label="Домой в xRocket Test"');
    expect(html).toContain('aria-label="Навигация xRocket Test"');
  });
});
