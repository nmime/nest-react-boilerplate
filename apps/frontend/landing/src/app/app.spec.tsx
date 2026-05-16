import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import App from "./app";

describe("Landing app shell", () => {
  it("renders generic boilerplate landing copy", () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain("Nest React Boilerplate");
    expect(html).toContain(
      "Launch a full-stack Nest and React product foundation.",
    );
    expect(html).toContain("Three frontends and three APIs");
  });
});
