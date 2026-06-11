import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from ".";

describe("Landing app", () => {
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
});
