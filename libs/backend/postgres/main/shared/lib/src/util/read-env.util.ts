import { createConfig } from "@app/common-config";
import Joi from "joi";
import { DefaultPostgresPort } from "../const";
import { booleanSchema } from "../postgres-env.schema";

export function readBoolean(
  value: string | undefined,
  name = "boolean value",
): boolean | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  try {
    return createConfig<{ VALUE?: boolean }>(
      Joi.object<{ VALUE?: boolean }>({
        VALUE: booleanSchema.empty("").optional(),
      }),
      { env: { VALUE: value.trim() } },
    ).get("VALUE");
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`${name} must be a boolean value.`, { cause: error });
    }

    throw error;
  }
}

export function readPort(value: string | undefined): number {
  try {
    return createConfig<{ POSTGRES_PORT: number }>(
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
      throw new Error(`Invalid POSTGRES_PORT: ${value}`, { cause: error });
    }

    throw error;
  }
}

export function readSslRejectUnauthorized(env: {
  POSTGRES_SSL_REJECT_UNAUTHORIZED?: string | boolean;
}): boolean {
  try {
    return createConfig<{ POSTGRES_SSL_REJECT_UNAUTHORIZED: boolean }>(
      Joi.object<{ POSTGRES_SSL_REJECT_UNAUTHORIZED: boolean }>({
        POSTGRES_SSL_REJECT_UNAUTHORIZED: booleanSchema.empty("").default(true),
      }),
      { env },
    ).get("POSTGRES_SSL_REJECT_UNAUTHORIZED");
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        "POSTGRES_SSL_REJECT_UNAUTHORIZED must be a boolean value.",
        { cause: error },
      );
    }

    throw error;
  }
}
