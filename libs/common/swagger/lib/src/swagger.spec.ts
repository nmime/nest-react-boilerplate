import { HttpStatus } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import {
  ApiOkDataResponse,
  ApiProblemExceptions,
  okResponseOpenApiSchema,
  problemDetailsOpenApiSchema,
  readBoolean,
  resolveSwaggerOptions,
  setupSwagger,
  getProblemDetailsSchema,
} from "./index";

const mocks = vi.hoisted(() => {
  const builder = {
    addBearerAuth: vi.fn(() => builder),
    build: vi.fn(() => "config"),
    setDescription: vi.fn(() => builder),
    setTitle: vi.fn(() => builder),
    setVersion: vi.fn(() => builder),
  };
  return {
    apiExtraModels: vi.fn(() => vi.fn()),
    apiOkResponse: vi.fn(() => vi.fn()),
    apiResponse: vi.fn(() => vi.fn()),
    builder,
    createDocument: vi.fn(() => "document"),
    setup: vi.fn(),
  };
});

vi.mock("@nestjs/swagger", () => ({
  ApiExtraModels: mocks.apiExtraModels,
  ApiOkResponse: mocks.apiOkResponse,
  ApiResponse: mocks.apiResponse,
  DocumentBuilder: vi.fn(function DocumentBuilderMock() {
    return mocks.builder;
  }),
  getSchemaPath: (model: { name: string }) =>
    `#/components/schemas/${model.name}`,
  SwaggerModule: {
    createDocument: mocks.createDocument,
    setup: mocks.setup,
  },
}));

describe("common swagger", () => {
  it("reads boolean flags and resolves environment overrides", () => {
    expect(readBoolean(undefined)).toBeUndefined();
    expect(readBoolean("true")).toBe(true);
    expect(readBoolean("0")).toBe(false);
    expect(
      resolveSwaggerOptions(
        { title: "api" },
        {
          OPENAPI_DESCRIPTION: "description",
          OPENAPI_ENABLED: "yes",
          OPENAPI_PATH: "openapi",
          OPENAPI_TITLE: "env api",
          OPENAPI_VERSION: "2.0.0",
        },
      ),
    ).toEqual({
      description: "description",
      enabled: true,
      path: "openapi",
      title: "env api",
      version: "2.0.0",
    });
  });

  it("skips disabled documentation", () => {
    setupSwagger({} as never, { enabled: false, title: "api" });
    expect(mocks.createDocument).not.toHaveBeenCalled();
  });

  it("creates bearer-auth swagger docs with problem response support", () => {
    const app = {} as never;

    setupSwagger(app, {
      description: "API docs",
      enabled: true,
      path: "docs",
      title: "api",
      version: "1.2.3",
    });

    expect(mocks.builder.setTitle).toHaveBeenCalledWith("api");
    expect(mocks.builder.setVersion).toHaveBeenCalledWith("1.2.3");
    expect(mocks.builder.setDescription).toHaveBeenCalledWith("API docs");
    expect(mocks.builder.addBearerAuth).toHaveBeenCalledOnce();
    expect(mocks.createDocument).toHaveBeenCalledWith(app, "config");
    expect(mocks.setup).toHaveBeenCalledWith("docs", app, "document", {
      jsonDocumentUrl: "docs/openapi.json",
    });
  });

  it("exports success and problem response schemas and decorators", () => {
    class PayloadDto {}

    expect(problemDetailsOpenApiSchema).toMatchObject({
      required: ["type", "title", "status"],
      type: "object",
    });
    expect(okResponseOpenApiSchema(PayloadDto)).toEqual({
      type: "object",
      required: ["data"],
      properties: {
        data: { $ref: "#/components/schemas/PayloadDto" },
      },
    });
    expect(ApiOkDataResponse(PayloadDto)).toEqual(expect.any(Function));
    expect(mocks.apiExtraModels).toHaveBeenCalledWith(PayloadDto);
    expect(mocks.apiOkResponse).toHaveBeenCalledWith({
      schema: okResponseOpenApiSchema(PayloadDto),
    });
    expect(typeof ApiProblemExceptions).toBe("function");
  });

  it("resolves explicit defaults and option descriptions", () => {
    expect(resolveSwaggerOptions({ title: "api" }, {})).toEqual({
      enabled: false,
      path: "docs",
      title: "api",
      version: "1.0.0",
    });
    expect(
      resolveSwaggerOptions(
        {
          description: "option docs",
          enabled: true,
          path: "custom-docs",
          title: "option api",
          version: "3.0.0",
        },
        {
          OPENAPI_DESCRIPTION: "env docs",
          OPENAPI_TITLE: "env api",
        },
      ),
    ).toEqual({
      description: "option docs",
      enabled: true,
      path: "custom-docs",
      title: "env api",
      version: "3.0.0",
    });
  });

  it("creates problem response decorators for known and custom statuses", () => {
    expect(ApiProblemExceptions(HttpStatus.BAD_REQUEST, 599)).toEqual(
      expect.any(Function),
    );
    expect(mocks.apiResponse).toHaveBeenCalledWith({
      status: HttpStatus.BAD_REQUEST,
      description: "Bad Request",
      content: {
        "application/problem+json": {
          schema: getProblemDetailsSchema(HttpStatus.BAD_REQUEST),
        },
      },
    });
    expect(mocks.apiResponse).toHaveBeenCalledWith({
      status: 599,
      description: "Unexpected Error",
      content: {
        "application/problem+json": {
          schema: getProblemDetailsSchema(599),
        },
      },
    });
  });

  it("creates swagger docs without an optional description", () => {
    const app = {} as never;

    setupSwagger(app, {
      enabled: true,
      path: "docs-no-description",
      title: "api",
      version: "1.2.3",
    });

    expect(mocks.createDocument).toHaveBeenCalledWith(app, "config");
    expect(mocks.setup).toHaveBeenCalledWith(
      "docs-no-description",
      app,
      "document",
      { jsonDocumentUrl: "docs-no-description/openapi.json" },
    );
  });
});
