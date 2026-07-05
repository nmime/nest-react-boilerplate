import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { IsGreaterThan } from "./is-greater-than.decorator";

class Bounds {
  min!: unknown;

  @IsGreaterThan("min")
  max!: unknown;
}

class BoundsWithMessage {
  min!: unknown;

  @IsGreaterThan("min", { message: "max must be greater than min" })
  max!: unknown;
}

async function firstConstraint(
  instance: Bounds | BoundsWithMessage,
): Promise<Record<string, string> | undefined> {
  const errors = await validate(instance);
  return errors[0]?.constraints;
}

describe("IsGreaterThan", () => {
  it("passes when the value is strictly greater than the related number", async () => {
    const bounds = Object.assign(new Bounds(), { min: 1, max: 2 });

    await expect(validate(bounds)).resolves.toEqual([]);
  });

  it("fails when the value equals the related number", async () => {
    const bounds = Object.assign(new Bounds(), { min: 5, max: 5 });

    await expect(firstConstraint(bounds)).resolves.toHaveProperty(
      "isGreaterThan",
    );
  });

  it("fails when the value is less than the related number", async () => {
    const bounds = Object.assign(new Bounds(), { min: 10, max: 1 });

    await expect(firstConstraint(bounds)).resolves.toHaveProperty(
      "isGreaterThan",
    );
  });

  it("fails when the validated value is not a number", async () => {
    const bounds = Object.assign(new Bounds(), { min: 1, max: "3" });

    await expect(firstConstraint(bounds)).resolves.toHaveProperty(
      "isGreaterThan",
    );
  });

  it("fails when the related value is not a number", async () => {
    const bounds = Object.assign(new Bounds(), { min: "1", max: 3 });

    await expect(firstConstraint(bounds)).resolves.toHaveProperty(
      "isGreaterThan",
    );
  });

  it("uses the provided validation options message", async () => {
    const bounds = Object.assign(new BoundsWithMessage(), { min: 9, max: 1 });

    await expect(firstConstraint(bounds)).resolves.toEqual({
      isGreaterThan: "max must be greater than min",
    });
  });
});
