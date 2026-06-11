import { ArgumentMetadata, HttpStatus, ValidationPipe } from "@nestjs/common";
import { IsString } from "class-validator";
import { describe, expect, it } from "vitest";
import {
  ClientDataValidationException,
  createValidationExceptionBody,
  createValidationPipe,
} from "./index";

describe("createValidationPipe", () => {
  it("creates a Nest validation pipe", () => {
    expect(createValidationPipe()).toBeInstanceOf(ValidationPipe);
  });

  it("creates problem details for validation errors", () => {
    expect(
      createValidationExceptionBody([
        {
          property: "name",
          constraints: { isString: "name must be a string" },
          detail: "name must be a string",
          message: "name must be a string",
          pointer: "/name",
        },
      ]),
    ).toEqual({
      type: "urn:problem:nest-react-boilerplate:client-data-validation",
      title: "Client data validation failed",
      status: 400,
      code: "client-data-validation",
      detail: "Request client data validation failed.",
      errors: [
        {
          property: "name",
          constraints: { isString: "name must be a string" },
          detail: "name must be a string",
          message: "name must be a string",
          pointer: "/name",
        },
      ],
    });
  });

  it("uses empty constraints when class-validator provides none", () => {
    expect(
      createValidationExceptionBody([
        {
          property: "nested",
        },
      ]),
    ).toMatchObject({
      errors: [{ property: "nested", constraints: {}, pointer: "/nested" }],
    });
  });

  it("flattens nested validation errors", () => {
    expect(
      createValidationExceptionBody([
        {
          property: "profile",
          children: [
            {
              property: "displayName",
              constraints: { isString: "displayName must be a string" },
              detail: "displayName must be a string",
              message: "displayName must be a string",
              pointer: "/profile/displayName",
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
                      detail: "city must be a string",
                      message: "city must be a string",
                      pointer: "/profile/addresses/0/city",
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
          detail: "displayName must be a string",
          message: "displayName must be a string",
          pointer: "/profile/displayName",
        },
        {
          property: "profile.addresses.0.city",
          constraints: { isString: "city must be a string" },
          detail: "city must be a string",
          message: "city must be a string",
          pointer: "/profile/addresses/0/city",
        },
      ],
    });
  });

  it("escapes JSON Pointer path segments", () => {
    expect(
      createValidationExceptionBody([
        {
          property: "profile/primary",
          children: [
            {
              property: "tilde~field",
              constraints: { isString: "tilde~field must be a string" },
            },
          ],
        },
      ]),
    ).toMatchObject({
      errors: [
        {
          property: "profile/primary.tilde~field",
          pointer: "/profile~1primary/tilde~0field",
        },
      ],
    });
  });

  it("creates full RFC 9457-compatible client data validation exceptions", () => {
    const exception = new ClientDataValidationException([
      {
        property: "age",
        constraints: { isInt: "age must be an integer number" },
        message: "age must be an integer number",
        detail: "age must be an integer number",
        pointer: "/age",
      },
    ]);

    expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(exception.getResponse()).toEqual({
      type: "urn:problem:nest-react-boilerplate:client-data-validation",
      title: "Client data validation failed",
      status: 400,
      detail: "Request client data validation failed.",
      code: "client-data-validation",
      errors: [
        {
          property: "age",
          constraints: { isInt: "age must be an integer number" },
          message: "age must be an integer number",
          detail: "age must be an integer number",
          pointer: "/age",
        },
      ],
    });
  });

  it("throws problem details from the pipe exception factory", async () => {
    class CreateUserDto {
      @IsString()
      name!: string;
    }

    const pipe = createValidationPipe();
    const metadata: ArgumentMetadata = {
      data: undefined,
      metatype: CreateUserDto,
      type: "body",
    };

    await expect(
      pipe.transform({ name: 123 }, metadata),
    ).rejects.toBeInstanceOf(ClientDataValidationException);

    try {
      await pipe.transform({ name: 123 }, metadata);
    } catch (error) {
      expect(
        (error as ClientDataValidationException).getResponse(),
      ).toMatchObject({
        errors: [
          {
            constraints: { isString: "name must be a string" },
            detail: "name must be a string",
            message: "name must be a string",
            pointer: "/name",
            property: "name",
          },
        ],
        code: "client-data-validation",
        detail: "Request client data validation failed.",
        status: 400,
        title: "Client data validation failed",
        type: "urn:problem:nest-react-boilerplate:client-data-validation",
      });
    }
  });
});
