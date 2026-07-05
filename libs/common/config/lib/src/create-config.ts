export interface ConfigAccessorOptions {
  readonly env?: ConfigEnvironment;
}

export type ConfigEnvironment = Readonly<Record<string, unknown>>;

export interface ConfigValidationResult<TConfig> {
  readonly value: TConfig;
  readonly error?: { readonly message: string };
}

export interface ConfigSchema<TConfig> {
  validate(
    value: ConfigEnvironment,
    options: {
      readonly abortEarly: boolean;
      readonly allowUnknown: boolean;
      readonly convert: boolean;
      readonly stripUnknown: boolean;
    },
  ): ConfigValidationResult<TConfig>;
}

export interface ConfigAccessor<TConfig> {
  readonly values: Readonly<TConfig>;
  get<TKey extends keyof TConfig>(key: TKey): TConfig[TKey];
}

export function createConfig<TConfig>(
  schema: ConfigSchema<TConfig>,
  options: ConfigAccessorOptions = {},
): ConfigAccessor<TConfig> {
  const validation = schema.validate(
    options.env ?? defaultConfigEnvironment(),
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

function defaultConfigEnvironment(): ConfigEnvironment {
  // `process` is not guaranteed on `globalThis` across runtimes (browser, edge
  // workers), so read it through a shape where it is genuinely optional rather
  // than trusting the Node ambient types that force it to be always present.
  const runtime = globalThis as {
    readonly process?: { readonly env?: ConfigEnvironment };
  };

  return runtime.process?.env ?? {};
}
