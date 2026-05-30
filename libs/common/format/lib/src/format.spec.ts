import { describe, expect, it } from "vitest";
import { CommonFormatService } from "./index";

describe("CommonFormatService", () => {
  it("formats numbers and currencies", () => {
    const service = new CommonFormatService("en-US");
    expect(service.number(1234.5)).toBe("1,234.5");
    expect(service.currency(12, "USD")).toBe("$12.00");
  });
});
