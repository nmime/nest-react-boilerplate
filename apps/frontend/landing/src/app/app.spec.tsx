import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from ".";

describe("Landing app", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders generic boilerplate landing copy", () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain("Nest React Boilerplate");
    expect(html).toContain(
      "Launch a full-stack Nest and React product foundation.",
    );
    expect(html).toContain("What is included");
    expect(html).toContain('href="/auth/docs"');
    expect(html).toContain('href="/app"');
    expect(html).toContain('href="/admin"');
  });

  it("renders polished overview and action readiness sections", () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain("landing-overview__grid");
    expect(html).toContain("landing-stat-grid");
    expect(html).toContain("Shared libraries");
    expect(html).toContain("landing-action-panel");
  });

  it("uses a configured auth API docs URL when provided", () => {
    vi.stubEnv("VITE_AUTH_API_BASE_URL", "https://auth.example.test/");

    const html = renderToStaticMarkup(<App />);

    expect(html).toContain('href="https://auth.example.test/docs"');
  });

  it("keeps the docs action available when production config falls back", () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("MODE", "production");
    vi.stubEnv("VITE_API_BASE_URL_MODE", "");
    vi.stubEnv("VITE_AUTH_API_BASE_URL", "");

    const html = renderToStaticMarkup(<App />);

    expect(html).toContain('href="/auth/docs"');
    expect(html).toContain(
      "API docs configuration is using the same-origin fallback.",
    );
  });
});
