import { ValidationPipe } from "@nestjs/common";
import { PIPES_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";
import { ApiValidation } from "./api-validation.decorator";

describe("ApiValidation", () => {
  it("returns a usable decorator", () => {
    expect(typeof ApiValidation()).toBe("function");
  });

  it("registers a configured ValidationPipe on the decorated class", () => {
    @ApiValidation()
    class DecoratedController {}

    const pipes = Reflect.getMetadata(
      PIPES_METADATA,
      DecoratedController,
    ) as unknown[];

    expect(pipes).toHaveLength(1);
    expect(pipes[0]).toBeInstanceOf(ValidationPipe);
  });

  it("registers a configured ValidationPipe on a decorated method", () => {
    class DecoratedController {
      @ApiValidation()
      handle(): string {
        return "handled";
      }
    }

    const handler: unknown = Object.getOwnPropertyDescriptor(
      DecoratedController.prototype,
      "handle",
    )?.value;
    if (typeof handler !== "function") {
      throw new Error("Decorated handler is missing.");
    }

    const pipes = Reflect.getMetadata(PIPES_METADATA, handler) as unknown[];

    expect(pipes[0]).toBeInstanceOf(ValidationPipe);
  });
});
