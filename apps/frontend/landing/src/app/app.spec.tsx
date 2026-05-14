import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import App from "./app";

describe("Landing app shell", () => {
  it("renders the landing product copy through the shared shell", () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain("xRocket Landing");
    expect(html).toContain("A product front door for the xRocket ecosystem.");
    expect(html).toContain("Product narrative");
    expect(html).toContain("Public surface");
  });
});
