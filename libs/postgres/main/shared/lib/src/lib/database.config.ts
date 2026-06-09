import { Injectable } from "@nestjs/common";
import { createConfig } from "@app/common-config";
import Joi from "joi";

export interface PostgresEnvironment {
  DATABASE_URL?: string;
  POSTGRES_HOST: string;
  POSTGRES_PORT: number;
  POSTGRES_USER: string;
  POSTGRES_PASSWORD: string;
  POSTGRES_DB: string;
  POSTGRES_SSL: boolean;
  POSTGRES_SSL_REJECT_UNAUTHORIZED: boolean;
  POSTGRES_SYNCHRONIZE?: boolean;
  POSTGRES_LOGGING: boolean;
}

export const DefaultPostgresHost = "localhost";
export const DefaultPostgresPort = 5432;
export const DefaultPostgresUser = "postgres";
export const DefaultPostgresDatabase = "postgres";

const booleanSchema = Joi.boolean()
  .truthy("1", "true", "yes", "on")
  .falsy("0", "false", "no", "off");

const schema = Joi.object<PostgresEnvironment>({
  DATABASE_URL: Joi.string().empty("").optional(),
  POSTGRES_HOST: Joi.string().empty("").default(DefaultPostgresHost),
  POSTGRES_PORT: Joi.number()
    .integer()
    .port()
    .empty("")
    .default(DefaultPostgresPort),
  POSTGRES_USER: Joi.string().empty("").default(DefaultPostgresUser),
  POSTGRES_PASSWORD: Joi.string().empty("").default("postgres"),
  POSTGRES_DB: Joi.string().empty("").default(DefaultPostgresDatabase),
  POSTGRES_SSL: booleanSchema.empty("").default(false),
  POSTGRES_SSL_REJECT_UNAUTHORIZED: booleanSchema.empty("").default(true),
  POSTGRES_SYNCHRONIZE: booleanSchema.empty("").optional(),
  POSTGRES_LOGGING: booleanSchema.empty("").default(false),
});

@Injectable()
export class PostgresDatabaseConfigService {
  protected readonly configService = createConfig(schema);

  get databaseUrl(): string | undefined {
    return this.configService.get("DATABASE_URL");
  }

  get host(): string {
    return this.configService.get("POSTGRES_HOST");
  }

  get port(): number {
    return this.configService.get("POSTGRES_PORT");
  }

  get user(): string {
    return this.configService.get("POSTGRES_USER");
  }

  get password(): string {
    return this.configService.get("POSTGRES_PASSWORD");
  }

  get database(): string {
    return this.configService.get("POSTGRES_DB");
  }

  get ssl(): boolean {
    return this.configService.get("POSTGRES_SSL");
  }

  get sslRejectUnauthorized(): boolean {
    return this.configService.get("POSTGRES_SSL_REJECT_UNAUTHORIZED");
  }

  get synchronize(): boolean | undefined {
    return this.configService.get("POSTGRES_SYNCHRONIZE");
  }

  get logging(): boolean {
    return this.configService.get("POSTGRES_LOGGING");
  }

  get values(): Readonly<PostgresEnvironment> {
    return this.configService.values;
  }
}

export function createPostgresEnvironment(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): Readonly<PostgresEnvironment> {
  return createConfig(schema, { env }).values;
}

export function readBoolean(
  value: string | undefined,
  name = "boolean value",
): boolean | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  try {
    return createConfig(
      Joi.object<{ VALUE?: boolean }>({
        VALUE: booleanSchema.empty("").optional(),
      }),
      { env: { VALUE: value.trim() } },
    ).get("VALUE");
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`${name} must be a boolean value.`);
    }

    throw error;
  }
}

export function readPort(value: string | undefined): number {
  try {
    return createConfig(
      Joi.object<{ POSTGRES_PORT: number }>({
        POSTGRES_PORT: Joi.number()
          .integer()
          .port()
          .empty("")
          .default(DefaultPostgresPort),
      }),
      { env: { POSTGRES_PORT: value } },
    ).get("POSTGRES_PORT");
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Invalid POSTGRES_PORT: ${value}`);
    }

    throw error;
  }
}

export function readSslRejectUnauthorized(env: {
  POSTGRES_SSL_REJECT_UNAUTHORIZED?: string | boolean;
}): boolean {
  try {
    return createConfig(
      Joi.object<{ POSTGRES_SSL_REJECT_UNAUTHORIZED: boolean }>({
        POSTGRES_SSL_REJECT_UNAUTHORIZED: booleanSchema.empty("").default(true),
      }),
      { env },
    ).get("POSTGRES_SSL_REJECT_UNAUTHORIZED");
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        "POSTGRES_SSL_REJECT_UNAUTHORIZED must be a boolean value.",
      );
    }

    throw error;
  }
}
