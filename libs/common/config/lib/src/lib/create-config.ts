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
  const { value, error } = schema.validate(options.env ?? process.env, {
    abortEarly: false,
    allowUnknown: true,
    convert: true,
    stripUnknown: false,
  });

  if (error) {
    throw new Error(`Invalid environment configuration: ${error.message}`);
  }

  const values = Object.freeze(value as TConfig);

  return {
    values,
    get<TKey extends keyof TConfig>(key: TKey): TConfig[TKey] {
      return values[key];
    },
  };
}
