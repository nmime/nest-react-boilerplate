import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { IsDateAfter } from "./is-date-after.decorator";

class DateRange {
  start!: unknown;

  @IsDateAfter("start")
  end!: unknown;
}

class DateRangeWithMessage {
  start!: unknown;

  @IsDateAfter("start", { message: "end must be after start" })
  end!: unknown;
}

async function firstConstraint(
  instance: DateRange | DateRangeWithMessage,
): Promise<Record<string, string> | undefined> {
  const errors = await validate(instance);
  return errors[0]?.constraints;
}

describe("IsDateAfter", () => {
  it("passes when the date is strictly after the related date", async () => {
    const range = Object.assign(new DateRange(), {
      start: new Date("2025-01-01T00:00:00Z"),
      end: new Date("2025-06-01T00:00:00Z"),
    });

    await expect(validate(range)).resolves.toEqual([]);
  });

  it("fails when the date equals the related date", async () => {
    const range = Object.assign(new DateRange(), {
      start: new Date("2025-01-01T00:00:00Z"),
      end: new Date("2025-01-01T00:00:00Z"),
    });

    await expect(firstConstraint(range)).resolves.toHaveProperty("isDateAfter");
  });

  it("fails when the date is before the related date", async () => {
    const range = Object.assign(new DateRange(), {
      start: new Date("2025-06-01T00:00:00Z"),
      end: new Date("2025-01-01T00:00:00Z"),
    });

    await expect(firstConstraint(range)).resolves.toHaveProperty("isDateAfter");
  });

  it("fails when the validated value is not a Date", async () => {
    const range = Object.assign(new DateRange(), {
      start: new Date("2025-01-01T00:00:00Z"),
      end: "2025-06-01",
    });

    await expect(firstConstraint(range)).resolves.toHaveProperty("isDateAfter");
  });

  it("fails when the related value is not a Date", async () => {
    const range = Object.assign(new DateRange(), {
      start: "2025-01-01",
      end: new Date("2025-06-01T00:00:00Z"),
    });

    await expect(firstConstraint(range)).resolves.toHaveProperty("isDateAfter");
  });

  it("uses the provided validation options message", async () => {
    const range = Object.assign(new DateRangeWithMessage(), {
      start: new Date("2025-06-01T00:00:00Z"),
      end: new Date("2025-01-01T00:00:00Z"),
    });

    await expect(firstConstraint(range)).resolves.toEqual({
      isDateAfter: "end must be after start",
    });
  });
});
