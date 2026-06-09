import { Transform } from "class-transformer";

export const StringToPairs = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value !== "string") {
      return value;
    }

    return value
      .split(",")
      .map((pair) => pair.split(":").map((item) => item.trim()))
      .filter((pair) => pair.length === 2);
  });
