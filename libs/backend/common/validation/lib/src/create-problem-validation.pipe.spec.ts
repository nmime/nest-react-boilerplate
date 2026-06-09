import {
  ArgumentMetadata,
  BadRequestException,
  ValidationPipe,
} from "@nestjs/common";
import { IsString } from "class-validator";
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
      type: "urn:problem:nest-react-boilerplate:validation-error",
      title: "Validation failed",
      status: 400,
      code: "validation-error",
      detail: "Request validation failed.",
      errors: [
        {
          property: "name",
          constraints: { isString: "name must be a string" },
        },
      ],
    });
  });

  it("uses empty constraints when class-validator provides none", () => {
    expect(
      createProblemValidationBody([
        {
          property: "nested",
        },
      ]),
    ).toMatchObject({
      errors: [{ property: "nested", constraints: {} }],
    });
  });

  it("flattens nested validation errors", () => {
    expect(
      createProblemValidationBody([
        {
          property: "profile",
          children: [
            {
              property: "displayName",
              constraints: { isString: "displayName must be a string" },
            },
            {
              property: "addresses",
              children: [
                {
                  property: "0",
                  children: [
                    {
                      property: "city",
                      constraints: { isString: "city must be a string" },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ]),
    ).toMatchObject({
      errors: [
        {
          property: "profile.displayName",
          constraints: { isString: "displayName must be a string" },
        },
        {
          property: "profile.addresses.0.city",
          constraints: { isString: "city must be a string" },
        },
      ],
    });
  });

  it("throws problem details from the pipe exception factory", async () => {
    class CreateUserDto {
      @IsString()
      name!: string;
    }

    const pipe = createProblemValidationPipe();
    const metadata: ArgumentMetadata = {
      data: undefined,
      metatype: CreateUserDto,
      type: "body",
    };

    await expect(
      pipe.transform({ name: 123 }, metadata),
    ).rejects.toBeInstanceOf(BadRequestException);

    try {
      await pipe.transform({ name: 123 }, metadata);
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toMatchObject({
        errors: [
          {
            constraints: { isString: "name must be a string" },
            property: "name",
          },
        ],
        status: 400,
        title: "Validation failed",
      });
    }
  });
});
