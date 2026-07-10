import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/frontend-runtime", () => ({
  useI18n: () => ({
    t: (key: string) => {
      const fallback: Record<string, string> = {
        "user.appName": "Nest React Boilerplate",
        "user.eyebrow": "Fullstack monorepo",
        "site.title": "Nest React Boilerplate",
        "site.description": "Production-grade starter for NestJS + React teams.",
        "site.actionGroup.label": "Quick links",
        "site.action.app": "Open App",
        "site.action.docs": "Auth Docs",
        "site.status.label": "System status",
        "site.status.online": "All systems operational",
        "site.metricGroup.label": "Project metrics",
        "site.routeGroup.label": "Routes",
      };
      return fallback[key] ?? key;
    },
  }),
}));

vi.mock("@app/frontend-feature-user-i18n", () => ({
  userFrontendTranslations: {},
}));

vi.mock("../styles/site.css", () => ({}));

describe("site home page", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("renders the site hero with a heading and two CTA links", async () => {
    const { Page } = await import("./+Page");
    render(<Page />);

    const heading = screen.getByRole("heading", { name: "Nest React Boilerplate" });
    expect(heading).toBeTruthy();

    const appLink = screen.getByRole("link", { name: "Open App" });
    expect(appLink.getAttribute("href")).toBe("/app");

    const docsLink = screen.getByRole("link", { name: "Auth Docs" });
    expect(docsLink.getAttribute("href")).toBe("/auth/docs");
  });

  it("renders three metric articles", async () => {
    const { Page } = await import("./+Page");
    render(<Page />);

    const articles = screen.getAllByRole("article");
    expect(articles).toHaveLength(3);
  });

  it("renders three route links", async () => {
    const { Page } = await import("./+Page");
    render(<Page />);

    const routeLinks = screen.getAllByRole("link", { name: /[A-Za-z]/ });
    // CTA links + route links
    expect(routeLinks.length).toBeGreaterThanOrEqual(5);
  });
});
