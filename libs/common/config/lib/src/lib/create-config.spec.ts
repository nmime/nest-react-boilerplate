import Joi from "joi";

import { createConfig } from "./create-config";

describe("createConfig", () => {
  it("validates and exposes typed values", () => {
    const config = createConfig(
      Joi.object({
        APP_NAME: Joi.string().required(),
        PORT: Joi.number().integer().required(),
      }),
      { env: { APP_NAME: "api", PORT: "3000" } },
    );

    expect(config.values).toEqual({ APP_NAME: "api", PORT: 3000 });
    expect(config.get("APP_NAME")).toBe("api");
    expect(config.get("PORT")).toBe(3000);
  });

  it("throws when schema validation fails", () => {
    expect(() =>
      createConfig(
        Joi.object({
          APP_NAME: Joi.string().required(),
        }),
        { env: {} },
      ),
    ).toThrow(/APP_NAME/u);
  });

  it("keeps unknown environment values available", () => {
    const config = createConfig(
      Joi.object({
        APP_NAME: Joi.string().required(),
      }),
      { env: { APP_NAME: "api", EXTRA: "kept" } },
    );

    expect(config.values).toMatchObject({ APP_NAME: "api", EXTRA: "kept" });
  });
});
