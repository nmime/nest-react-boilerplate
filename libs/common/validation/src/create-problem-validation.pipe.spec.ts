import { ValidationPipe } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import {
  createProblemValidationBody,
  createProblemValidationPipe,
} from "./index";

describe("createProblemValidationPipe", () => {
  it("creates a Nest validation pipe", () => {
    expect(createProblemValidationPipe()).toBeInstanceOf(ValidationPipe);
  });

  it("creates problem details for validation errors", () => {
    expect(
      createProblemValidationBody([
        {
          property: "name",
          constraints: { isString: "name must be a string" },
        },
      ]),
    ).toEqual({
      type: "https://example.com/problems/validation-error",
      title: "Validation failed",
      status: 400,
      detail: "Request validation failed.",
      errors: [
        {
          property: "name",
          constraints: { isString: "name must be a string" },
        },
      ],
    });
  });
});
