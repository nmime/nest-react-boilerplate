import { describe, expect, it } from "vitest";

import { nativeTamaguiConfig, nativeTokens } from "./tamagui-config";

describe("native tamagui config", () => {
  it("exports a tamagui config object with themes and tokens", () => {
    expect(nativeTamaguiConfig).toBeDefined();
    expect(nativeTamaguiConfig.themes).toBeDefined();
    expect(nativeTamaguiConfig.tokens).toBeDefined();
    expect(nativeTamaguiConfig.fonts).toBeDefined();
  });

  it("defines light and dark themes with required color keys", () => {
    const themes = nativeTamaguiConfig.themes;
    expect(themes).toHaveProperty("light");
    expect(themes).toHaveProperty("dark");

    for (const mode of ["light", "dark"] as const) {
      const theme = themes[mode];
      expect(theme).toHaveProperty("primary");
      expect(theme).toHaveProperty("background");
      expect(theme).toHaveProperty("color");
      expect(theme).toHaveProperty("borderColor");
      expect(theme).toHaveProperty("accent");
      expect(theme).toHaveProperty("destructive");
    }
  });

  it("exports tokens with color, radius, size, space, and zIndex", () => {
    expect(nativeTokens).toBeDefined();
    expect(nativeTokens.color).toBeDefined();
    expect(nativeTokens.radius).toBeDefined();
    expect(nativeTokens.size).toBeDefined();
    expect(nativeTokens.space).toBeDefined();
    expect(nativeTokens.zIndex).toBeDefined();
  });

  it("defines zIndex tokens with expected values", () => {
    const zIndex = nativeTokens.zIndex;
    expect(zIndex[0]).toBe(0);
    expect(zIndex[1]).toBe(10);
    expect(zIndex[2]).toBe(100);
    expect(zIndex[3]).toBe(1000);
  });

  it("includes negative space tokens", () => {
    const space = nativeTokens.space;
    expect(space["-1"]).toBeDefined();
    expect(space["-2"]).toBeDefined();
    expect(space["-3"]).toBeDefined();
    expect(space["-4"]).toBeDefined();
    expect(space["-1"]).toBeLessThan(0);
    expect(space["-4"]).toBeLessThan(space["-1"]);
  });

  it("has font sizes from 1 to 6", () => {
    const bodyFont = nativeTamaguiConfig.fonts.body;
    expect(bodyFont.size[1]).toBe(12);
    expect(bodyFont.size[6]).toBe(32);
  });
});
