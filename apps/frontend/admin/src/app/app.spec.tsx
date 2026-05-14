import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import App from "./app";

describe("Admin app shell", () => {
  it("renders the admin product copy through the shared shell", () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain("xRocket Admin");
    expect(html).toContain(
      "Operate the xRocket platform with a unified admin experience.",
    );
    expect(html).toContain("Operational visibility");
    expect(html).toContain("Review operations");
  });
});
