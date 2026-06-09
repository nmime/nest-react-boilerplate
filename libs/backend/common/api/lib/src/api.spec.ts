import { describe, expect, it } from "vitest";
import {
  ApiResponseKind,
  getHttpApiFailureResponseKind,
  HttpMethod,
} from "./index";

describe("common api", () => {
  it("maps common HTTP statuses to response kinds", () => {
    expect(getHttpApiFailureResponseKind(400)).toBe(ApiResponseKind.BadRequest);
    expect(getHttpApiFailureResponseKind(401)).toBe(
      ApiResponseKind.Unauthorized,
    );
    expect(getHttpApiFailureResponseKind(404)).toBe(ApiResponseKind.NotFound);
    expect(getHttpApiFailureResponseKind(500)).toBe(
      ApiResponseKind.ServerError,
    );
  });

  it("exports stable HTTP method constants", () => {
    expect(HttpMethod.POST).toBe("POST");
  });
});
