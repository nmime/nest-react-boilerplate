import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import App from "./app";

describe("User app shell", () => {
  it("renders the user product copy through the shared shell", () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain("xRocket App");
    expect(html).toContain(
      "Personal crypto operations in one reliable workspace.",
    );
    expect(html).toContain("Wallet overview");
    expect(html).toContain("Explore workspace");
  });
});
