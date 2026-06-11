import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { withLandingProviders } from "./with-landing-providers";

describe("withLandingProviders", () => {
  it("uses an explicit component displayName", () => {
    const Named = () => <span>named landing provider child</span>;
    Named.displayName = "ExplicitLandingChild";

    const Wrapped = withLandingProviders(Named);

    expect(Wrapped.displayName).toBe(
      "withLandingProviders(ExplicitLandingChild)",
    );
    expect(renderToStaticMarkup(<Wrapped />)).toContain(
      "named landing provider child",
    );
  });

  it("falls back to Component when the wrapped component has no name", () => {
    const Anonymous = (() => (
      <span>anonymous landing provider child</span>
    )) as ComponentType;
    Object.defineProperty(Anonymous, "name", { value: undefined });

    const Wrapped = withLandingProviders(Anonymous);

    expect(Wrapped.displayName).toBe("withLandingProviders(Component)");
    expect(renderToStaticMarkup(<Wrapped />)).toContain(
      "anonymous landing provider child",
    );
  });
});
