import { type ExecutionContext } from "@nestjs/common";
import { ROUTE_ARGS_METADATA } from "@nestjs/common/constants";
import { plainToInstance } from "class-transformer";
import { describe, expect, it } from "vitest";
import { Cron, CronExpressionMetadataKey } from "./cron.decorator";
import { Geo } from "./geo.decorator";
import { Ip } from "./ip.decorator";
import { Lang } from "./lang.decorator";
import {
  MaxObjectSize,
  MaxObjectSizeMetadataKey,
} from "./max-object-size.decorator";
import { StringToArray } from "./string-to-array.decorator";
import { StringToPairs } from "./string-to-pairs.decorator";

type ParamFactory = (data: unknown, context: ExecutionContext) => unknown;

function paramFactoryOf(enhancer: () => ParameterDecorator): ParamFactory {
  class Target {
    run(@enhancer() value: unknown): unknown {
      return value;
    }
  }

  const metadata = Reflect.getMetadata(
    ROUTE_ARGS_METADATA,
    Target,
    "run",
  ) as Record<string, { factory: ParamFactory }>;
  const [entry] = Object.values(metadata);
  return entry.factory;
}

function httpContext(request: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe("Geo param decorator", () => {
  it("reads the resolved geo data off the request", () => {
    const factory = paramFactoryOf(Geo);

    expect(factory(undefined, httpContext({ geo: { country: "US" } }))).toEqual(
      { country: "US" },
    );
  });
});

describe("Ip param decorator", () => {
  it("reads the request ip", () => {
    const factory = paramFactoryOf(Ip);

    expect(factory(undefined, httpContext({ ip: "203.0.113.7" }))).toBe(
      "203.0.113.7",
    );
  });
});

describe("Lang param decorator", () => {
  it("returns the request locale when present", () => {
    const factory = paramFactoryOf(Lang);

    expect(factory(undefined, httpContext({ locale: "ru" }))).toBe("ru");
  });

  it("defaults to en when no locale is set", () => {
    const factory = paramFactoryOf(Lang);

    expect(factory(undefined, httpContext({}))).toBe("en");
  });
});

describe("StringToPairs decorator", () => {
  class PairsDto {
    @StringToPairs()
    pairs?: unknown;
  }

  it("parses a comma/colon separated string into trimmed pairs", () => {
    const result = plainToInstance(PairsDto, { pairs: "a:1, b:2, invalid" });

    expect(result.pairs).toEqual([
      ["a", "1"],
      ["b", "2"],
    ]);
  });

  it("passes non-string values through unchanged", () => {
    const result = plainToInstance(PairsDto, { pairs: 123 });

    expect(result.pairs).toBe(123);
  });
});

describe("StringToArray decorator", () => {
  class RolesDto {
    @StringToArray()
    roles?: unknown;
  }

  it("normalizes a delimited string into a unique list", () => {
    const result = plainToInstance(RolesDto, { roles: "admin ops,admin" });

    expect(result.roles).toEqual(["admin", "ops"]);
  });
});

describe("Cron / MaxObjectSize metadata decorators", () => {
  class Jobs {
    @Cron("*/5 * * * *")
    sync(): string {
      return "sync";
    }

    @MaxObjectSize(1024)
    upload(): string {
      return "upload";
    }
  }

  it("attaches the cron expression as method metadata", () => {
    expect(
      // eslint-disable-next-line @typescript-eslint/unbound-method -- metadata lives on the raw method reference
      Reflect.getMetadata(CronExpressionMetadataKey, Jobs.prototype.sync),
    ).toBe("*/5 * * * *");
  });

  it("attaches the max object size as method metadata", () => {
    expect(
      // eslint-disable-next-line @typescript-eslint/unbound-method -- metadata lives on the raw method reference
      Reflect.getMetadata(MaxObjectSizeMetadataKey, Jobs.prototype.upload),
    ).toBe(1024);
  });
});
