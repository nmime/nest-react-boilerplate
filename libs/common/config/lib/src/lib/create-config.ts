import type Joi from "joi";

export interface ConfigAccessorOptions {
  readonly env?: Record<string, unknown>;
}

export interface ConfigAccessor<TConfig> {
  readonly values: Readonly<TConfig>;
  get<TKey extends keyof TConfig>(key: TKey): TConfig[TKey];
}

export function createConfig<TConfig>(
  schema: Joi.ObjectSchema<TConfig>,
  options: ConfigAccessorOptions = {},
): ConfigAccessor<TConfig> {
  const validation: Joi.ValidationResult<TConfig> = schema.validate(
    options.env ?? process.env,
    {
      abortEarly: false,
      allowUnknown: true,
      convert: true,
      stripUnknown: false,
    },
  );

  if (validation.error) {
    throw new Error(
      `Invalid environment configuration: ${validation.error.message}`,
    );
  }

  const values = Object.freeze(validation.value);

  return {
    values,
    get<TKey extends keyof TConfig>(key: TKey): TConfig[TKey] {
      return values[key];
    },
  };
}
