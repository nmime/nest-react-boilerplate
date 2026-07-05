import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { EnumValidationPipe } from "./enum-validation.pipe";

const colors = ["red", "green"] as const;

describe("EnumValidationPipe", () => {
  it("passes through an allowed value", () => {
    const pipe = new EnumValidationPipe(colors);

    expect(pipe.transform("red")).toBe("red");
  });

  it("rejects a value outside the allowed set", () => {
    const pipe = new EnumValidationPipe(colors);

    expect(() => pipe.transform("blue" as (typeof colors)[number])).toThrow(
      BadRequestException,
    );
  });
});
